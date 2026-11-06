#!/usr/bin/env python3
"""Fetch public posts from @1_dsa1, filter relevant opportunities, and write data.json."""
from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

HANDLE = "1_dsa1"
PROFILE_URL = f"https://x.com/{HANDLE}"
READER_URL = f"https://r.jina.ai/http://x.com/{HANDLE}"
OUTPUT = Path(__file__).resolve().parents[1] / "data.json"
MAX_POSTS = 36

CATEGORY_RULES = [
    ("دورات", ["دورة", "دورات", "دوره", "الدورات"]),
    ("برامج تدريبية", ["برنامج تدريبي", "البرنامج التدريبي", "برامج تدريبية", "التدريبية", "تدريب"]),
    ("ورش عمل", ["ورشة", "ورش", "ورشة عمل", "ورش عمل"]),
    ("محاضرات", ["محاضرة", "محاضرات", "محاضره", "محاضرات"]),
    ("حملات", ["حملة", "حملات"]),
    ("بطولات", ["بطولة", "بطولات"]),
    ("مسابقات", ["مسابقة", "مسابقات"]),
    ("مبادرات", ["مبادرة", "مبادرات"]),
]
KEYWORDS = sorted({term for _, terms in CATEGORY_RULES for term in terms}, key=len, reverse=True)


def fetch_source() -> tuple[str, str]:
    request = urllib.request.Request(
        PROFILE_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; Dsa1OpportunityFeed/1.0; +https://github.com/)"
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
        if len(body) >= 10000:
            return body.decode("utf-8", errors="replace"), "x-html"
    except urllib.error.HTTPError as error:
        if error.code not in {403, 429}:
            raise

    fallback = urllib.request.Request(READER_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(fallback, timeout=30) as response:
        body = response.read()
    if len(body) < 1000:
        raise RuntimeError("Both public profile sources returned unexpectedly small responses")
    return body.decode("utf-8", errors="replace"), "jina-markdown"


def snowflake_datetime(post_id: str) -> str | None:
    try:
        milliseconds = (int(post_id) >> 22) + 1288834974657
        return datetime.fromtimestamp(milliseconds / 1000, tz=timezone.utc).isoformat()
    except (ValueError, OverflowError, OSError):
        return None


def categories_for(text: str) -> list[str]:
    found = [label for label, terms in CATEGORY_RULES if any(term in text for term in terms)]
    return found or ["أخرى"]


def extract_posts(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    posts: list[dict] = []
    seen: set[str] = set()

    for article in soup.select("article"):
        status_link = None
        post_id = None
        display_date = ""
        for anchor in article.select("a[href]"):
            match = re.search(rf"/{re.escape(HANDLE)}/status/(\d+)", anchor.get("href", ""))
            if match:
                post_id = match.group(1)
                status_link = f"https://x.com/{HANDLE}/status/{post_id}"
                display_date = anchor.get_text(" ", strip=True)
                break
        if not post_id or post_id in seen:
            continue

        text = ""
        for element in article.find_all(["div", "p"]):
            classes = set(element.get("class", []))
            if "text-primary" in classes and "whitespace-pre-wrap" in classes:
                text = element.get_text(" ", strip=True)
                break
        if not text or not any(keyword in text for keyword in KEYWORDS):
            continue

        seen.add(post_id)
        posts.append(
            {
                "id": post_id,
                "text": re.sub(r"\s+", " ", text).strip(),
                "publishedAt": snowflake_datetime(post_id),
                "displayDate": display_date,
                "url": status_link,
                "categories": categories_for(text),
            }
        )
        if len(posts) >= MAX_POSTS:
            break

    if not posts:
        raise RuntimeError("No matching public posts were found; keeping the last successful data.json")
    return posts


def extract_markdown_posts(markdown: str) -> list[dict]:
    """Fallback parser for the public reader when X blocks GitHub runner IPs."""
    pattern = re.compile(r"\]\(https://x\.com/1_dsa1\)\s+(.*?)(?=\s+!\[|\n\*|\Z)", re.DOTALL)
    posts: list[dict] = []
    seen: set[str] = set()
    for match in pattern.finditer(markdown):
        text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", match.group(1))
        text = re.sub(r"\s+", " ", text).strip(" *\n")
        if not text or not any(keyword in text for keyword in KEYWORDS):
            continue
        post_id = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
        if post_id in seen:
            continue
        seen.add(post_id)
        posts.append(
            {
                "id": post_id,
                "text": text,
                "publishedAt": None,
                "displayDate": "أحدث منشور",
                "url": PROFILE_URL,
                "categories": categories_for(text),
            }
        )
        if len(posts) >= MAX_POSTS:
            break
    if not posts:
        raise RuntimeError("The fallback reader returned no matching public posts")
    return posts


def preserve_known_links(posts: list[dict]) -> list[dict]:
    if not OUTPUT.exists():
        return posts
    try:
        previous = json.loads(OUTPUT.read_text(encoding="utf-8")).get("posts", [])
    except (OSError, json.JSONDecodeError):
        return posts
    by_text = {item.get("text"): item for item in previous if item.get("text")}
    for post in posts:
        old = by_text.get(post["text"])
        if old:
            post.update({key: old[key] for key in ("id", "publishedAt", "displayDate", "url") if old.get(key)})
    return posts


def main() -> int:
    try:
        source, source_mode = fetch_source()
        posts = extract_posts(source) if source_mode == "x-html" else extract_markdown_posts(source)
        posts = preserve_known_links(posts)
    except Exception as error:
        print(f"fetch_posts.py: {error}", file=sys.stderr)
        return 1

    category_order = [label for label, _ in CATEGORY_RULES] + ["أخرى"]
    categories = [label for label in category_order if any(label in post["categories"] for post in posts)]
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"handle": f"@{HANDLE}", "profileUrl": PROFILE_URL, "mode": source_mode},
        "count": len(posts),
        "categories": categories,
        "posts": posts,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(posts)} matching posts to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

const state = { tweets: [], keywords: [], query: '' };
const els = {
  keywords: document.querySelector('#demo-keywords'),
  search: document.querySelector('#demo-search'),
  clear: document.querySelector('#demo-clear'),
  reset: document.querySelector('#demo-reset'),
  posts: document.querySelector('#demo-posts'),
  empty: document.querySelector('#demo-empty'),
  status: document.querySelector('#demo-status'),
  source: document.querySelector('#demo-source-status')
};

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function matches(tweet) {
  const query = state.query.trim().toLocaleLowerCase('ar');
  if (!query) return true;
  return `${tweet.text} ${(tweet.keywords || []).join(' ')}`.toLocaleLowerCase('ar').includes(query);
}

function tweetCard(tweet) {
  return `<article class="post-card demo-post-card">
    <div class="card-top"><span class="card-category">تغريدة تجريبية</span><time class="card-date">${escapeHTML(tweet.date)}</time></div>
    <p class="post-text">${escapeHTML(tweet.text)}</p>
    <div class="post-footer"><div class="post-tags">${tweet.keywords.map((keyword) => `<span class="post-tag">#${escapeHTML(keyword)}</span>`).join('')}</div><span class="demo-local-badge">محلي</span></div>
  </article>`;
}

function renderKeywords() {
  els.keywords.innerHTML = state.keywords.map((keyword) => `<button type="button" class="demo-keyword ${state.query === keyword ? 'active' : ''}" data-keyword="${escapeHTML(keyword)}">${escapeHTML(keyword)}</button>`).join('');
  els.keywords.querySelectorAll('[data-keyword]').forEach((button) => button.addEventListener('click', () => {
    state.query = button.dataset.keyword;
    els.search.value = state.query;
    els.clear.hidden = false;
    render();
  }));
}

function render() {
  const filtered = state.tweets.filter(matches);
  els.posts.innerHTML = filtered.map(tweetCard).join('');
  els.posts.hidden = filtered.length === 0;
  els.empty.hidden = filtered.length > 0;
  els.status.textContent = state.query ? `يعرض ${filtered.length} تغريدة تحتوي «${state.query}» من أصل ${state.tweets.length}` : `يعرض جميع التغريدات التجريبية: ${filtered.length}`;
  renderKeywords();
}

function reset() {
  state.query = '';
  els.search.value = '';
  els.clear.hidden = true;
  render();
}

async function loadDemoTweets() {
  try {
    const response = await fetch(`demo-tweets.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.tweets = data.tweets || [];
    state.keywords = data.keywords || [];
    els.source.textContent = `تم جلب ${state.tweets.length} تغريدة من ملف محلي`;
    render();
  } catch (error) {
    els.source.textContent = 'تعذر جلب الملف المحلي';
    els.status.textContent = 'تعذر تحميل بيانات التجربة.';
    console.error('Demo data load failed', error);
  }
}

els.search.addEventListener('input', (event) => { state.query = event.target.value; els.clear.hidden = !state.query; render(); });
els.clear.addEventListener('click', reset);
els.reset.addEventListener('click', reset);
loadDemoTweets();

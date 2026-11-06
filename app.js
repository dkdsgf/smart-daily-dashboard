const state = {
  data: { posts: [], categories: [], generatedAt: null },
  activeCategory: 'الكل',
  query: ''
};

const els = {
  grid: document.querySelector('#posts-grid'),
  filters: document.querySelector('#filters'),
  search: document.querySelector('#search-input'),
  clear: document.querySelector('#clear-search'),
  status: document.querySelector('#feed-status'),
  empty: document.querySelector('#empty-state'),
  updated: document.querySelector('#last-updated'),
  total: document.querySelector('#total-count'),
  categoryCount: document.querySelector('#category-count'),
  year: document.querySelector('#year')
};

const categoryLabels = {
  'الكل': 'كل الفرص',
  'دورات': 'دورات',
  'برامج تدريبية': 'برامج تدريبية',
  'ورش عمل': 'ورش عمل',
  'محاضرات': 'محاضرات',
  'تعاون': 'تعاون',
  'حملات': 'حملات',
  'توعية': 'توعية',
  'بطولات': 'بطولات',
  'هاكاثونات': 'هاكاثونات',
  'مسابقات': 'مسابقات',
  'مبادرات': 'مبادرات',
  'أخرى': 'أخرى'
};

const DATA_SOURCES = [
  'https://raw.githubusercontent.com/dkdsgf/dsa1-opportunities/main/data.json',
  'data.json'
];

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function formatDate(iso, fallback) {
  if (!iso) return fallback || 'منشور حديثًا';
  try {
    return new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  } catch { return fallback || 'منشور حديثًا'; }
}

function relativeUpdated(iso) {
  if (!iso) return 'وقت التحديث غير متاح';
  try {
    const date = new Date(iso);
    const delta = Math.max(0, Date.now() - date.getTime());
    const hours = Math.floor(delta / 3600000);
    if (hours < 1) return 'آخر تحديث: منذ أقل من ساعة';
    if (hours < 24) return `آخر تحديث: منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `آخر تحديث: منذ ${days} يوم`;
  } catch { return 'آخر تحديث غير متاح'; }
}

function renderFilters() {
  const categories = ['الكل', ...(state.data.categories || [])];
  els.filters.innerHTML = categories.map((category) => `
    <button class="filter-button ${category === state.activeCategory ? 'active' : ''}" type="button" role="tab" aria-selected="${category === state.activeCategory}" data-category="${escapeHTML(category)}">
      ${escapeHTML(categoryLabels[category] || category)}
    </button>
  `).join('');
  els.filters.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeCategory = button.dataset.category;
      renderFilters();
      renderPosts();
    });
  });
}

function filteredPosts() {
  const query = state.query.trim().toLocaleLowerCase('ar');
  return (state.data.posts || []).filter((post) => {
    const inCategory = state.activeCategory === 'الكل' || (post.categories || []).includes(state.activeCategory);
    const searchable = `${post.text || ''} ${(post.categories || []).join(' ')}`.toLocaleLowerCase('ar');
    return inCategory && (!query || searchable.includes(query));
  });
}

function postCard(post) {
  const category = (post.categories || [])[0] || 'أخرى';
  const extraTags = (post.categories || []).slice(1, 3).map((tag) => `<span class="post-tag">#${escapeHTML(tag)}</span>`).join('');
  return `
    <article class="post-card">
      <div class="card-top">
        <span class="card-category">${escapeHTML(categoryLabels[category] || category)}</span>
        <time class="card-date" datetime="${escapeHTML(post.publishedAt || '')}">${escapeHTML(formatDate(post.publishedAt, post.displayDate))}</time>
      </div>
      <p class="post-text">${escapeHTML(post.text)}</p>
      <div class="post-footer">
        <div class="post-tags">${extraTags || '<span class="post-tag">@1_dsa1</span>'}</div>
        <a class="post-link" href="${escapeHTML(post.url)}" target="_blank" rel="noreferrer">التفاصيل <span aria-hidden="true">←</span></a>
      </div>
    </article>
  `;
}

function renderPosts() {
  const posts = filteredPosts();
  els.grid.innerHTML = posts.map(postCard).join('');
  els.empty.hidden = posts.length > 0;
  els.grid.hidden = posts.length === 0;
  const total = state.data.posts?.length || 0;
  els.status.textContent = state.query || state.activeCategory !== 'الكل' ? `يعرض ${posts.length} من أصل ${total} منشورًا` : `يعرض أحدث ${posts.length} منشورًا مطابقًا`;
}

function renderData(data) {
  state.data = data;
  els.total.textContent = data.posts?.length || 0;
  els.categoryCount.textContent = data.categories?.length || 0;
  els.updated.textContent = relativeUpdated(data.generatedAt);
  renderFilters();
  renderPosts();
}

async function loadData() {
  let lastError;
  for (const source of DATA_SOURCES) {
    try {
      const response = await fetch(`${source}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      renderData(data);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  {
    els.updated.textContent = 'تعذر تحديث البيانات الآن';
    els.status.textContent = 'تعذر جلب البيانات. جرّب تحديث الصفحة لاحقًا.';
    els.grid.hidden = true;
    els.empty.hidden = false;
    els.empty.querySelector('h3').textContent = 'البيانات غير متاحة مؤقتًا';
    els.empty.querySelector('p').textContent = 'تعذر تحميل آخر نسخة من المنشورات، لكن يمكنك زيارة الحساب الأصلي من الرابط أعلى الصفحة.';
    console.error('Failed to load live and local data sources', lastError);
  }
}

els.search.addEventListener('input', (event) => {
  state.query = event.target.value;
  els.clear.hidden = !state.query;
  renderPosts();
});
els.clear.addEventListener('click', () => {
  els.search.value = '';
  state.query = '';
  els.clear.hidden = true;
  els.search.focus();
  renderPosts();
});
els.year.textContent = new Date().getFullYear();
loadData();

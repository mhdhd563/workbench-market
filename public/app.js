const state = { categories: [], workbenches: [] }

async function load() {
  const [categories, workbenches] = await Promise.all([
    fetch('/api/categories').then((r) => r.json()),
    fetch('/api/workbenches').then((r) => r.json())
  ])
  state.categories = categories
  state.workbenches = workbenches
  renderCategories()
  render()
}

function renderCategories() {
  const select = document.getElementById('category-filter')
  for (const category of state.categories) {
    const option = document.createElement('option')
    option.value = category.id
    option.textContent = category.name.zh
    select.appendChild(option)
  }
}

function render() {
  const query = document.getElementById('search').value.trim().toLowerCase()
  const category = document.getElementById('category-filter').value
  const result = document.getElementById('result')

  const categoryMap = new Map(state.categories.map((c) => [c.id, c.name.zh]))

  const items = state.workbenches.filter((entry) => {
    if (category && entry.category !== category) return false
    if (!query) return true
    const haystack = [entry.name, entry.nameEn, entry.owner, entry.id, categoryMap.get(entry.category)]
      .filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })

  if (!items.length) {
    result.innerHTML = '<div class="empty">没有匹配的工作台。</div>'
    return
  }

  result.innerHTML = items.map((entry) => {
    const screenshot = entry.screenshots?.[0]?.url || ''
    const categoryName = categoryMap.get(entry.category) || entry.category
    return `
      <article class="card">
        ${screenshot ? `<img class="thumb" src="${escapeHtml(screenshot)}" alt="${escapeHtml(entry.name)}" loading="lazy" />` : '<div class="thumb"></div>'}
        <div class="body">
          <div class="title">${escapeHtml(entry.name)}${entry.nameEn ? ' · ' + escapeHtml(entry.nameEn) : ''}</div>
          <div class="meta">
            <span class="chip">${escapeHtml(categoryName)}</span>
            <span>v${escapeHtml(entry.version)}</span>
            <span>${escapeHtml(entry.owner)}</span>
            <span>${escapeHtml(entry.license || '')}</span>
          </div>
          <div class="desc">${escapeHtml(entry.description?.zh || '')}</div>
          <div class="actions">
            <a class="btn small" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener">查看 GitHub</a>
          </div>
        </div>
      </article>`
  }).join('')
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

document.getElementById('category-filter').addEventListener('change', render)
document.getElementById('search').addEventListener('input', render)

load().catch((error) => {
  document.getElementById('result').innerHTML = `<div class="empty">加载失败：${escapeHtml(error.message)}</div>`
})
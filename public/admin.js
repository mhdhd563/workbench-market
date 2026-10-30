let filter = 'all'
let records = []
let categoryMap = new Map()

const STATUS_LABEL = { pending: '待审核', approved: '已通过', rejected: '已拒绝', archived: '已下架' }

async function load() {
  const [categories, workbenches] = await Promise.all([
    fetch('/api/categories').then((r) => r.json()),
    fetch('/api/admin/workbenches').then((r) => r.json())
  ])
  categoryMap = new Map(categories.map((c) => [c.id, c.name.zh]))
  records = workbenches
  renderTabs()
  render()
}

function renderTabs() {
  const tabs = [
    ['all', '全部'],
    ['pending', `待审核 (${count('pending')})`],
    ['approved', `已通过 (${count('approved')})`],
    ['rejected', `已拒绝 (${count('rejected')})`],
    ['archived', `已下架 (${count('archived')})`]
  ]
  el('filter-tabs').innerHTML = tabs.map(([key, label]) =>
    `<a href="#" data-filter="${key}" class="${filter === key ? 'active' : ''}">${label}</a>`
  ).join('')
  for (const link of el('filter-tabs').querySelectorAll('a')) {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      filter = link.dataset.filter
      renderTabs()
      render()
    })
  }
}

function count(status) {
  return records.filter((r) => r.status === status).length
}

function render() {
  const list = records.filter((r) => filter === 'all' || r.status === filter)
  const result = el('result')

  if (!list.length) {
    result.innerHTML = '<div class="empty">暂无记录。</div>'
    return
  }

  result.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>工作台</th><th>状态</th><th>分类</th><th>作者</th><th>版本</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((r) => row(r)).join('')}
      </tbody>
    </table>`

  bindActions(result)
}

function row(r) {
  return `
    <tr data-id="${escapeHtml(r.id)}">
      <td>
        <div><strong>${escapeHtml(r.name)}</strong></div>
        <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(r.id)}</div>
        ${r.rejectReason ? `<div style="font-size:12px;color:var(--danger)">拒绝原因：${escapeHtml(r.rejectReason)}</div>` : ''}
      </td>
      <td><span class="badge ${escapeHtml(r.status)}">${STATUS_LABEL[r.status] || r.status}</span></td>
      <td>${escapeHtml(categoryMap.get(r.category) || r.category)}</td>
      <td>${escapeHtml(r.owner)}</td>
      <td>v${escapeHtml(r.version)}</td>
      <td class="cell-actions">${actions(r)}</td>
    </tr>`
}

function actions(r) {
  const id = encodeURIComponent(r.id)
  const buttons = []
  if (r.status === 'pending' || r.status === 'rejected' || r.status === 'archived') {
    buttons.push(`<button class="btn small primary" data-action="approve">通过</button>`)
  }
  if (r.status === 'pending') {
    buttons.push(`<button class="btn small" data-action="reject">拒绝</button>`)
  }
  if (r.status === 'approved') {
    buttons.push(`<button class="btn small" data-action="unpublish">下架</button>`)
  }
  buttons.push(`<a class="btn small" href="/submit?edit=${id}">编辑</a>`)
  buttons.push(`<button class="btn small danger" data-action="delete">删除</button>`)
  return buttons.join(' ')
}

function bindActions(root) {
  for (const button of root.querySelectorAll('[data-action]')) {
    button.addEventListener('click', () => runAction(button))
  }
}

async function runAction(button) {
  const tr = button.closest('tr')
  const id = decodeURIComponent(tr.dataset.id)
  const action = button.dataset.action
  let body
  if (action === 'reject') {
    const reason = window.prompt('拒绝原因（可选）', '')
    if (reason === null) return
    body = { reason }
  }
  if (action === 'delete' && !window.confirm(`确认删除 ${id}？此操作不可恢复。`)) return

  const method = 'POST'
  const path = `/api/admin/workbenches/${action}`
  const payload = { id, ...(body || {}) }

  button.disabled = true
  try {
    const response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    setMessage('success', '操作成功。')
    await load()
  } catch (error) {
    setMessage('error', error.message)
  } finally {
    button.disabled = false
  }
}

function el(id) { return document.getElementById(id) }

function setMessage(type, text) {
  const box = el('message')
  box.innerHTML = type && text ? `<div class="message ${type}">${escapeHtml(text)}</div>` : ''
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

load().catch((error) => {
  el('result').innerHTML = `<div class="empty">加载失败：${escapeHtml(error.message)}</div>`
})
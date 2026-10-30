const editId = new URLSearchParams(window.location.search).get('edit')
let categories = []

const el = (id) => document.getElementById(id)
const val = (id) => el(id).value.trim()

function setMessage(type, text) {
  const box = el('message')
  box.innerHTML = type && text ? `<div class="message ${type}">${escapeHtml(text)}</div>` : ''
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function field(labelText, inputHtml) {
  const wrapper = document.createElement('div')
  wrapper.className = 'field'
  const label = document.createElement('label')
  label.textContent = labelText
  wrapper.appendChild(label)
  const div = document.createElement('div')
  div.innerHTML = inputHtml
  wrapper.appendChild(div)
  return wrapper
}

function renderDistributionFields(type, data = {}) {
  const container = el('distribution-fields')
  container.innerHTML = ''
  if (type === 'npm') {
    container.appendChild(field('npm 包名 <span class="hint">name</span>', `<input id="dist-name" value="${escapeHtml(data.name || '')}" placeholder="@scope/pkg" />`))
    container.appendChild(field('integrity（可选）', `<input id="dist-integrity" value="${escapeHtml(data.integrity || '')}" placeholder="sha512-..." />`))
  } else if (type === 'github-release') {
    container.appendChild(field('Release .tgz 下载地址（HTTPS）', `<input id="dist-url" value="${escapeHtml(data.url || '')}" placeholder="https://github.com/owner/repo/releases/download/v1.0.0/pkg.tgz" />`))
    container.appendChild(field('SHA-256（64 位 hex）', `<input id="dist-sha256" value="${escapeHtml(data.sha256 || '')}" placeholder="a1b2..." />`))
    container.appendChild(field('字节数 bytes（可选）', `<input id="dist-bytes" type="number" value="${data.bytes ?? ''}" placeholder="123456" />`))
  } else {
    container.appendChild(field('仓库 URL', `<input id="dist-url" value="${escapeHtml(data.url || '')}" placeholder="https://github.com/owner/repo" />`))
    container.appendChild(field('commit SHA', `<input id="dist-commit" value="${escapeHtml(data.commit || '')}" placeholder="40 位 commit" />`))
  }
}

function screenshotItem(data = {}) {
  const wrapper = document.createElement('div')
  wrapper.className = 'screenshot-item'
  wrapper.innerHTML = `
    <div class="row">
      ${inlineField('screenshot-url', 'URL（HTTPS）', data.url || '')}
      ${inlineField('screenshot-alt', 'alt 描述', data.alt || '')}
    </div>
    <div class="row-3">
      ${inlineField('screenshot-width', '宽 width', data.width ?? '')}
      ${inlineField('screenshot-height', '高 height', data.height ?? '')}
      ${inlineField('screenshot-bytes', '字节 bytes', data.bytes ?? '')}
    </div>
    <div class="field" style="margin-bottom: 4px;">
      <label>SHA-256（64 位 hex）</label>
      <input class="screenshot-sha256" value="${escapeHtml(data.sha256 || '')}" placeholder="a1b2..." />
    </div>
    <button type="button" class="btn small danger screenshot-remove">删除</button>`
  wrapper.querySelector('.screenshot-remove').addEventListener('click', () => wrapper.remove())
  return wrapper
}

function inlineField(inputClass, labelText, value) {
  return `<div class="field"><label>${escapeHtml(labelText)}</label><input class="${inputClass}" value="${escapeHtml(value)}" /></div>`
}

function addScreenshot(data) {
  el('screenshots').appendChild(screenshotItem(data))
}

function parseScreenshots() {
  return [...el('screenshots').querySelectorAll('.screenshot-item')].map((item) => {
    const get = (cls) => item.querySelector(`.${cls}`).value.trim()
    return {
      url: get('screenshot-url'),
      alt: get('screenshot-alt'),
      width: Number(get('screenshot-width')),
      height: Number(get('screenshot-height')),
      bytes: Number(get('screenshot-bytes')),
      sha256: get('screenshot-sha256')
    }
  })
}

function parseDistribution() {
  const type = el('dist-type').value
  const version = val('version')
  const dist = { type, version }
  if (type === 'npm') {
    dist.name = val('dist-name') || undefined
    if (val('dist-integrity')) dist.integrity = val('dist-integrity')
  } else if (type === 'github-release') {
    dist.url = val('dist-url')
    dist.sha256 = val('dist-sha256')
    if (val('dist-bytes')) dist.bytes = Number(val('dist-bytes'))
  } else {
    dist.url = val('dist-url')
    dist.commit = val('dist-commit')
  }
  return dist
}

function collect() {
  const legacyIds = val('legacyWorkbenchIds')
  const payload = {
    owner: val('owner'),
    repository: val('repository'),
    url: val('url'),
    name: val('name'),
    nameEn: val('nameEn') || undefined,
    description: { zh: val('description-zh'), en: val('description-en') },
    category: val('category'),
    version: val('version'),
    license: val('license'),
    distribution: parseDistribution(),
    screenshots: parseScreenshots()
  }
  if (val('workbenchId')) payload.workbenchId = val('workbenchId')
  if (legacyIds) {
    payload.legacyWorkbenchIds = legacyIds.split(',').map((id) => id.trim()).filter(Boolean)
  }
  return payload
}

function syncUrl() {
  const owner = val('owner')
  const repository = val('repository')
  if (owner && repository) el('url').value = `https://github.com/${owner}/${repository}`
}

async function loadCategories() {
  categories = await fetch('/api/categories').then((r) => r.json())
  const select = el('category')
  for (const category of categories) {
    const option = document.createElement('option')
    option.value = category.id
    option.textContent = category.name.zh
    select.appendChild(option)
  }
}

async function loadForEdit() {
  const records = await fetch('/api/admin/workbenches').then((r) => r.json())
  const record = records.find((r) => r.id === editId)
  if (!record) {
    setMessage('error', '未找到要编辑的工作台。')
    return
  }
  el('page-title').textContent = '编辑工作台'
  el('page-subtitle').textContent = `正在编辑 ${record.id}，保存后状态更新。`
  el('submit-btn').textContent = '保存修改'

  el('owner').value = record.owner
  el('repository').value = record.repository
  el('url').value = record.url
  el('name').value = record.name
  el('nameEn').value = record.nameEn || ''
  el('description-zh').value = record.description.zh
  el('description-en').value = record.description.en
  el('category').value = record.category
  el('version').value = record.version
  el('license').value = record.license
  el('workbenchId').value = record.workbenchId || ''
  el('legacyWorkbenchIds').value = (record.legacyWorkbenchIds || []).join(', ')

  el('dist-type').value = record.distribution.type
  renderDistributionFields(record.distribution.type, record.distribution)

  for (const image of record.screenshots) addScreenshot(image)
}

el('owner').addEventListener('input', syncUrl)
el('repository').addEventListener('input', syncUrl)
el('dist-type').addEventListener('change', (event) => renderDistributionFields(event.target.value))
el('add-screenshot').addEventListener('click', () => addScreenshot())

el('workbench-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  setMessage('', '')
  const payload = collect()
  const url = editId ? '/api/admin/workbenches/edit' : '/api/submit'
  if (editId) payload.id = editId
  el('submit-btn').disabled = true
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    setMessage('success', editId ? '修改已保存。' : '提交成功，等待管理员审核。')
    if (!editId) el('workbench-form').reset()
  } catch (error) {
    setMessage('error', error.message)
  } finally {
    el('submit-btn').disabled = false
  }
})

;(async () => {
  try {
    await loadCategories()
    renderDistributionFields('github-release')
    if (editId) await loadForEdit()
    else addScreenshot()
  } catch (error) {
    setMessage('error', `初始化失败：${error.message}`)
  }
})()
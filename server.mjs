import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, dirname, extname, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStore } from './store.mjs'
import { buildIndex } from './publish.mjs'
import { validateWorkbench, ValidationError } from './validate.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(ROOT, 'data')
const PUBLIC_DIR = join(ROOT, 'public')
const PORT = Number(process.env.PORT || 8787)
const MAX_BODY_BYTES = 1024 * 1024

const store = createStore(DATA_DIR)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(body)
}

async function readBody(request) {
  const length = request.headers['content-length']
  if (length && Number(length) > MAX_BODY_BYTES) throw new ValidationError('Request payload is too large.')
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new ValidationError('Request payload is too large.')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ValidationError('Invalid JSON body.')
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'archived'])

function findWorkbench(records, id) {
  return records.findIndex((record) => record.id === id)
}

async function handleApi(pathname, method, request) {
  if (pathname === '/index.json' && method === 'GET') {
    const [categories, records] = await Promise.all([store.categories(), store.workbenches()])
    return { status: 200, body: buildIndex(categories, records) }
  }

  if (pathname === '/api/categories' && method === 'GET') {
    return { status: 200, body: await store.categories() }
  }

  if (pathname === '/api/workbenches' && method === 'GET') {
    const records = await store.workbenches()
    return { status: 200, body: records.filter((record) => record.status === 'approved') }
  }

  if (pathname === '/api/admin/workbenches' && method === 'GET') {
    return { status: 200, body: await store.workbenches() }
  }

  if (pathname === '/api/submit' && method === 'POST') {
    const payload = await readBody(request)
    const [categories, records] = await Promise.all([store.categories(), store.workbenches()])
    const entry = validateWorkbench(payload, new Set(categories.map((category) => category.id)))
    if (findWorkbench(records, entry.id) !== -1) {
      return { status: 409, body: { error: 'This workbench has already been submitted.' } }
    }
    const now = new Date().toISOString()
    const record = { status: 'pending', submittedAt: now, updatedAt: now, ...entry }
    records.push(record)
    await store.saveWorkbenches(records)
    return { status: 201, body: record }
  }

  // Admin actions take the workbench id in the JSON body so the owner/repo id
  // (which contains a slash) never collides with the URL path.
  const adminAction = async (name, handler) => {
    if (pathname === `/api/admin/workbenches/${name}` && method === 'POST') {
      const payload = await readBody(request)
      const id = payload.id
      if (typeof id !== 'string' || !id) return { status: 400, body: { error: 'A workbench id is required.' } }
      const records = await store.workbenches()
      const index = findWorkbench(records, id)
      if (index === -1) return { status: 404, body: { error: 'This workbench was not found.' } }
      return handler({ id, index, records, payload })
    }
    return null
  }

  const run = async () => {
    return await adminAction('approve', async ({ index, records }) => {
      const categories = await store.categories()
      const entry = validateWorkbench(records[index], new Set(categories.map((category) => category.id)))
      records[index] = { ...records[index], ...entry, status: 'approved', updatedAt: new Date().toISOString(), rejectReason: undefined }
      await store.saveWorkbenches(records)
      return { status: 200, body: records[index] }
    }) ?? await adminAction('reject', async ({ index, records, payload }) => {
      records[index].status = 'rejected'
      records[index].rejectReason = typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : ''
      records[index].updatedAt = new Date().toISOString()
      await store.saveWorkbenches(records)
      return { status: 200, body: records[index] }
    }) ?? await adminAction('unpublish', async ({ index, records }) => {
      records[index].status = 'archived'
      records[index].updatedAt = new Date().toISOString()
      await store.saveWorkbenches(records)
      return { status: 200, body: records[index] }
    }) ?? await adminAction('edit', async ({ index, records, payload }) => {
      const categories = await store.categories()
      const entry = validateWorkbench(payload, new Set(categories.map((category) => category.id)))
      const previous = records[index]
      const status = VALID_STATUSES.has(payload.status) ? payload.status : previous.status
      records[index] = { ...entry, status, updatedAt: new Date().toISOString(), ...(status === 'rejected' ? { rejectReason: previous.rejectReason } : {}) }
      await store.saveWorkbenches(records)
      return { status: 200, body: records[index] }
    }) ?? await adminAction('delete', async ({ index, records }) => {
      records.splice(index, 1)
      await store.saveWorkbenches(records)
      return { status: 200, body: { ok: true } }
    })
  }
  const adminResult = await run()
  if (adminResult) return adminResult

  return null
}

async function serveStatic(pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  if (rel === 'submit' || rel === 'admin' || rel === 'browse') rel = `${rel}.html`
  const resolved = resolve(PUBLIC_DIR, normalize(rel))
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + sep)) return null
  try {
    const data = await readFile(resolved)
    const type = MIME[extname(resolved).toLowerCase()] || 'application/octet-stream'
    return { status: 200, body: data, headers: { 'content-type': type } }
  } catch {
    return null
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    const pathname = url.pathname
    const method = request.method || 'GET'

    const apiResult = pathname.startsWith('/api/') || pathname === '/index.json'
      ? await handleApi(pathname, method, request)
      : null

    if (apiResult) {
      if (isObject(apiResult.body) || Array.isArray(apiResult.body)) {
        return sendJson(response, apiResult.status, apiResult.body)
      }
      response.writeHead(apiResult.status, apiResult.headers || { 'content-type': 'application/octet-stream' })
      return response.end(apiResult.body)
    }

    if (method === 'GET' || method === 'HEAD') {
      const file = await serveStatic(pathname)
      if (file) {
        response.writeHead(file.status, file.headers)
        return response.end(method === 'HEAD' ? undefined : file.body)
      }
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found.')
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500
    const message = error instanceof ValidationError ? error.message : 'Internal server error.'
    if (!(error instanceof ValidationError)) console.error(error)
    sendJson(response, status, { error: message })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Workbench market listening on http://127.0.0.1:${PORT}`)
  console.log(`  Browse:  http://127.0.0.1:${PORT}/`)
  console.log(`  Submit:  http://127.0.0.1:${PORT}/submit`)
  console.log(`  Admin:   http://127.0.0.1:${PORT}/admin`)
  console.log(`  Catalog: http://127.0.0.1:${PORT}/index.json`)
})
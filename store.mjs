import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback)
    throw error
  }
}

export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

/**
 * Serialized JSON-file persistence for categories and workbench records.
 * Reads hit disk on every operation so corrupt data surfaces instead of being
 * silently replaced by an in-memory copy.
 */
export function createStore(dataDir) {
  const categoriesPath = join(dataDir, 'categories.json')
  const workbenchesPath = join(dataDir, 'workbenches.json')
  let queue = Promise.resolve()
  const serial = (operation) => {
    const result = queue.then(operation)
    queue = result.catch(() => {})
    return result
  }

  return {
    categories: () => serial(async () => (await readJson(categoriesPath, { version: 1, categories: [] })).categories),
    workbenches: () => serial(async () => (await readJson(workbenchesPath, { version: 1, workbenches: [] })).workbenches),
    saveWorkbenches: (list) => serial(async () => {
      await writeJsonAtomic(workbenchesPath, { version: 1, workbenches: list })
      return list
    })
  }
}
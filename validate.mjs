// Field validation aligned with the Awesome protocol v2 catalog contract
// that DSH Desktop enforces in its workbench market reader.

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value) => typeof value === 'string' && value.trim() !== ''
const httpsUrl = (value) => {
  if (!text(value)) return false
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
const legacyWorkbenchId = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value)
const sha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const posInt = (value) => Number.isSafeInteger(value) && value > 0

export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
    this.status = 400
  }
}

export function validateCategory(category) {
  if (!object(category) || !text(category.id) || !object(category.name) || !text(category.name.zh)) {
    throw new ValidationError('Invalid workbench category.')
  }
  const name = { zh: category.name.zh }
  if (text(category.name.en)) name.en = category.name.en
  return { id: category.id, name }
}

function normalizeDistribution(distribution) {
  const type = distribution.type
  if (type === 'npm') {
    const out = { type, name: distribution.name, version: distribution.version }
    if (text(distribution.integrity)) out.integrity = distribution.integrity
    return out
  }
  if (type === 'github-release') {
    const out = { type, url: distribution.url, sha256: distribution.sha256, version: distribution.version }
    if (posInt(distribution.bytes)) out.bytes = distribution.bytes
    return out
  }
  const out = { type, url: distribution.url, commit: distribution.commit, version: distribution.version }
  return out
}

/**
 * Validates a submitted/edited workbench against the catalog contract and
 * returns a normalized catalog entry (without any internal tracking fields).
 */
export function validateWorkbench(input, categoryIds) {
  const fail = (message) => { throw new ValidationError(message) }
  if (!object(input)) fail('Workbench payload is required.')

  if (!text(input.owner)) fail('owner is required.')
  if (!text(input.repository)) fail('repository is required.')
  if (!text(input.url)) fail('repository URL is required.')

  const id = `${input.owner}/${input.repository}`.toLowerCase()
  if (input.url.toLowerCase() !== `https://github.com/${id}`) {
    fail('The repository URL must match owner/repository.')
  }
  if (!text(input.name)) fail('name is required.')
  if (!text(input.version)) fail('version is required.')
  if (!text(input.license)) fail('license is required.')
  if (!categoryIds.has(input.category)) fail('Unknown workbench category.')

  if (!object(input.description) || !text(input.description.zh) || !text(input.description.en)) {
    fail('Both the Chinese and English description are required.')
  }

  if (input.workbenchId !== undefined && input.workbenchId !== '' && !legacyWorkbenchId(input.workbenchId)) {
    fail('workbenchId must match the legacy id format.')
  }
  if (input.legacyWorkbenchIds !== undefined && input.legacyWorkbenchIds !== null && input.legacyWorkbenchIds !== '') {
    if (!Array.isArray(input.legacyWorkbenchIds)
      || !input.legacyWorkbenchIds.every(legacyWorkbenchId)
      || new Set(input.legacyWorkbenchIds).size !== input.legacyWorkbenchIds.length) {
      fail('legacyWorkbenchIds must be unique legacy ids.')
    }
  }

  const distribution = input.distribution
  if (!object(distribution) || !['npm', 'github-release', 'github-source'].includes(distribution.type)) {
    fail('distribution.type must be npm, github-release or github-source.')
  }
  if (!text(distribution.version) || distribution.version !== input.version) {
    fail('distribution.version must equal the workbench version.')
  }
  if (distribution.type === 'npm') {
    if (!text(distribution.name)) fail('npm distribution requires a name.')
  } else if (distribution.type === 'github-release') {
    if (!httpsUrl(distribution.url)) fail('github-release distribution URL must be HTTPS.')
    if (!sha256(distribution.sha256)) fail('github-release distribution requires a 64-char SHA-256.')
  } else {
    if (!/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)\/?$/.test(distribution.url)) {
      fail('github-source distribution URL is invalid.')
    }
    if (!text(distribution.commit)) fail('github-source distribution requires a commit.')
  }

  if (!Array.isArray(input.screenshots) || input.screenshots.length < 1) {
    fail('At least one screenshot is required.')
  }
  const screenshots = input.screenshots.map((image) => {
    if (!object(image) || !httpsUrl(image.url) || !text(image.alt) || !sha256(image.sha256)
      || !posInt(image.width) || !posInt(image.height) || !posInt(image.bytes)) {
      fail('Each screenshot needs an HTTPS url, alt, 64-char SHA-256 and positive width/height/bytes.')
    }
    return { url: image.url, alt: image.alt, sha256: image.sha256, width: image.width, height: image.height, bytes: image.bytes }
  })

  const entry = {
    id,
    owner: input.owner,
    repository: input.repository,
    url: input.url,
    name: input.name,
    description: { zh: input.description.zh, en: input.description.en },
    category: input.category,
    version: input.version,
    license: input.license,
    distribution: normalizeDistribution(distribution),
    screenshots
  }
  if (text(input.nameEn)) entry.nameEn = input.nameEn
  if (text(input.workbenchId)) entry.workbenchId = input.workbenchId
  if (Array.isArray(input.legacyWorkbenchIds) && input.legacyWorkbenchIds.length) {
    entry.legacyWorkbenchIds = input.legacyWorkbenchIds
  }
  return entry
}
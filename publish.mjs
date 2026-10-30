// Builds the published Awesome protocol v2 catalog (index.json) from approved
// workbench records. Only tracking fields that are not part of the catalog
// contract are stripped; every remaining field is passed through verbatim.

const CATALOG_FIELDS = [
  'id', 'owner', 'repository', 'url', 'name', 'nameEn', 'description',
  'category', 'version', 'license', 'distribution', 'workbenchId',
  'legacyWorkbenchIds', 'screenshots'
]

function toCatalogEntry(record) {
  const entry = {}
  for (const field of CATALOG_FIELDS) {
    if (record[field] !== undefined) entry[field] = record[field]
  }
  return entry
}

export function buildIndex(categories, records) {
  const workbenches = records
    .filter((record) => record.status === 'approved')
    .map(toCatalogEntry)
  return { schemaVersion: 2, kind: 'catalog', categories, workbenches }
}
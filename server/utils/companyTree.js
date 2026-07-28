import { Company } from '../models/index.js'

/*
|--------------------------------------------------------------------------
| Company hierarchy
|--------------------------------------------------------------------------
|
| models/Company.js has always had a `parentId` column and index.js has
| always declared the parent/children association — but nothing ever set
| it. COMPANY_WRITABLE_FIELDS in settings.routes.js deliberately stripped
| parentId from the request body, so there was no way to tell the system
| that "Acme Ltd" sits under "OS Group" at all.
|
| This module turns that dormant column into a real org tree:
|
|   getDescendantIds(id)  every company beneath one, at any depth
|   getCompanyTree(ids)   the nested shape the UI renders
|   assertNoCycle(...)    refuses to make a company its own ancestor
|
| The tree is small (tens of rows) and changes rarely, so the whole table
| is cached for a short window rather than issuing a recursive query on
| every dashboard load. Any write to a company invalidates it.
*/

const CACHE_TTL_MS = 30 * 1000
let cache = null // { rows, expires }

/** Drops the cached hierarchy. Call after any company create/update/delete. */
export const invalidateCompanyTree = () => {
  cache = null
}

const loadCompanies = async () => {
  if (cache && cache.expires > Date.now()) return cache.rows

  const rows = await Company.findAll({
    attributes: ['id', 'name', 'type', 'parentId', 'isActive', 'industry', 'logo', 'currency'],
    raw: true,
  })

  cache = { rows, expires: Date.now() + CACHE_TTL_MS }
  return rows
}

/**
 * Every company id beneath `rootId`, at any depth, NOT including the root.
 *
 * Walks breadth-first with a `seen` set, so a corrupted parentId cycle
 * (A -> B -> A) terminates instead of hanging the request. assertNoCycle()
 * below stops such a cycle being created in the first place; this is the
 * second line of defence for rows written before that check existed.
 */
export const getDescendantIds = async (rootId) => {
  if (!rootId) return []

  const rows = await loadCompanies()

  const childrenOf = new Map()
  for (const row of rows) {
    if (!row.parentId) continue
    const key = String(row.parentId)
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key).push(String(row.id))
  }

  const out = []
  const seen = new Set([String(rootId)])
  const queue = [String(rootId)]

  while (queue.length) {
    const current = queue.shift()
    for (const childId of childrenOf.get(current) || []) {
      if (seen.has(childId)) continue
      seen.add(childId)
      out.push(childId)
      queue.push(childId)
    }
  }

  return out
}

/**
 * The company plus all of its descendants — the exact id list a group
 * oversight query should filter on.
 */
export const getScopeIds = async (rootId) => {
  if (!rootId) return []
  return [String(rootId), ...(await getDescendantIds(rootId))]
}

/** True when this company has at least one child. */
export const hasChildren = async (companyId) => {
  if (!companyId) return false
  const rows = await loadCompanies()
  return rows.some((r) => String(r.parentId) === String(companyId))
}

/** Companies keyed by id, for cheap name lookups when labelling results. */
export const getCompanyMap = async () => {
  const rows = await loadCompanies()
  return new Map(rows.map((r) => [String(r.id), r]))
}

/**
 * Builds the nested tree the Group Console renders.
 * Pass `rootId` to return just that subtree; omit it for every root.
 */
export const getCompanyTree = async (rootId = null) => {
  const rows = await loadCompanies()
  const byId = new Map(rows.map((r) => [String(r.id), { ...r, children: [] }]))

  const roots = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(String(node.parentId)) : null
    // A parentId pointing at a deleted company would otherwise make the
    // node vanish from the tree entirely; treat it as a root instead.
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }

  const sortTree = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    nodes.forEach((n) => sortTree(n.children))
    return nodes
  }

  if (rootId) {
    const node = byId.get(String(rootId))
    return node ? sortTree([node]) : []
  }

  return sortTree(roots)
}

/**
 * Refuses a parent assignment that would create a loop.
 *
 * Without this, setting A.parentId = B while B is already a descendant of
 * A makes the hierarchy circular. getDescendantIds() would survive it
 * (see the `seen` set) but the tree renderer and every rollup query
 * would silently return wrong totals.
 *
 * Returns an error message, or null when the assignment is safe.
 */
export const assertNoCycle = async (companyId, newParentId) => {
  if (!newParentId) return null // becoming a root is always safe

  if (String(companyId) === String(newParentId)) {
    return 'A company cannot be its own parent.'
  }

  const descendants = await getDescendantIds(companyId)
  if (descendants.map(String).includes(String(newParentId))) {
    return 'That company is already below this one — the assignment would create a loop.'
  }

  return null
}

export default {
  getDescendantIds,
  getScopeIds,
  getCompanyTree,
  getCompanyMap,
  hasChildren,
  assertNoCycle,
  invalidateCompanyTree,
}

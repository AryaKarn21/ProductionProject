/*
|--------------------------------------------------------------------------
| Tenant-scoped record lookup
|--------------------------------------------------------------------------
|
| Every route file in this project mounts behind resolveCompany, which
| establishes a trusted req.companyId. But most :id handlers then did:
|
|     const row = await Model.findByPk(req.params.id)
|     if (!row) return res.status(404)...
|
| — a lookup by primary key with no tenant filter at all. An audit of the
| routes found ~38 of these across 10 files. Every one of them let any
| authenticated user read, edit or delete a record belonging to any other
| company on the platform, given only its UUID. Several of the affected
| handlers (tickets, projects, contacts) carried no permission check
| either, so a plain 'employee' account was enough.
|
| findInScope() is a drop-in replacement:
|
|     const row = await findInScope(req, Model, req.params.id, { include })
|     if (!row) return res.status(404)...
|
| It returns null both when the record does not exist AND when it belongs
| to another company, so the existing `if (!row) 404` line becomes the
| correct response for both cases — an attacker cannot use the status
| code to confirm that an id exists in a company they cannot see.
*/

/**
 * @param {object} req    Express request, after protect + resolveCompany
 * @param {object} Model  Sequelize model to look up
 * @param {string} id     Primary key
 * @param {object} options  Passed straight through to findByPk (include, attributes, transaction…)
 * @returns {Promise<object|null>}
 */
export const findInScope = async (req, Model, id, options = {}) => {
  if (!id) return null

  const row = await Model.findByPk(id, options)
  if (!row) return null

  // A super admin browsing with no company selected (no X-Company-ID
  // header) is intentionally cross-company — that is how resolveCompany
  // signals "all companies", and the settings screens rely on it.
  if (req.user?.role === 'super_admin' && !req.companyId) return row

  // Models without a companyId column (pure join tables) cannot be
  // tenant-checked here; the caller is responsible for reaching them
  // through their scoped parent instead.
  if (row.companyId === undefined) return row

  if (String(row.companyId) !== String(req.companyId)) return null

  return row
}

export default findInScope

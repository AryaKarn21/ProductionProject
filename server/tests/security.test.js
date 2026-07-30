import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
|--------------------------------------------------------------------------
| Security invariants
|--------------------------------------------------------------------------
|
| These lock down the rules that the tenant-isolation and RBAC work
| depends on. They exist because each one was, at some point, silently
| wrong in this codebase — a regression here would not throw, it would
| just quietly let one company read another's data.
|
| No database. utils/companyTree.js is exercised against a mocked
| Company model so the hierarchy logic itself is under test, and
| findInScope() takes its model as a parameter, so a plain fake is
| enough.
*/

// ── Fixtures: the real shape of the deployed hierarchy ──────────
const PARENT = 'c-parent'
const CHILD_A = 'c-a'
const CHILD_B = 'c-b'
const GRANDCHILD = 'c-a1'
const UNRELATED = 'c-outside'

const COMPANY_ROWS = [
  { id: PARENT, name: 'OS Group of Companies', parentId: null, isActive: true },
  { id: CHILD_A, name: 'Arya ltd', parentId: PARENT, isActive: true },
  { id: CHILD_B, name: 'thee', parentId: PARENT, isActive: true },
  { id: GRANDCHILD, name: 'Deep Sub', parentId: CHILD_A, isActive: true },
  { id: UNRELATED, name: 'Someone Else', parentId: null, isActive: true },
]

vi.mock('../models/index.js', () => ({
  Company: { findAll: vi.fn(async () => COMPANY_ROWS) },
}))

const {
  getDescendantIds,
  getAncestorIds,
  getRoleScopeIds,
  assertNoCycle,
  hasChildren,
  invalidateCompanyTree,
} = await import('../utils/companyTree.js')

const { findInScope } = await import('../utils/scope.js')

beforeEach(() => {
  // The tree is cached for 30s; without this the first test's result
  // would be reused and later tests would pass for the wrong reason.
  invalidateCompanyTree()
})

/*
|--------------------------------------------------------------------------
| Tenant isolation
|--------------------------------------------------------------------------
| ~38 handlers across 11 route files used a bare findByPk with no tenant
| filter, letting any authenticated user reach another company's records
| by UUID. findInScope() is what replaced them.
*/
describe('findInScope — tenant isolation', () => {
  const modelWith = (row) => ({ findByPk: async () => row })
  const employee = (companyId) => ({ user: { role: 'employee' }, companyId })

  it('returns a record belonging to the caller company', async () => {
    const row = { id: 'r1', companyId: CHILD_A }
    expect(await findInScope(employee(CHILD_A), modelWith(row), 'r1')).toBe(row)
  })

  it('returns null for a record owned by another company', async () => {
    const row = { id: 'r1', companyId: CHILD_B }
    expect(await findInScope(employee(CHILD_A), modelWith(row), 'r1')).toBeNull()
  })

  it('returns null — not an error — for a missing record, so the two are indistinguishable', async () => {
    // Matters: a different response for "exists elsewhere" vs "does not
    // exist" lets an attacker enumerate ids in other tenants.
    const missing = await findInScope(employee(CHILD_A), modelWith(null), 'nope')
    const foreign = await findInScope(
      employee(CHILD_A),
      modelWith({ id: 'r1', companyId: CHILD_B }),
      'r1'
    )
    expect(missing).toBeNull()
    expect(foreign).toBeNull()
  })

  it('lets a super admin with no company selected reach anything', async () => {
    const row = { id: 'r1', companyId: CHILD_B }
    const su = { user: { role: 'super_admin' }, companyId: null }
    expect(await findInScope(su, modelWith(row), 'r1')).toBe(row)
  })

  it('still scopes a super admin who HAS selected a company', async () => {
    const row = { id: 'r1', companyId: CHILD_B }
    const su = { user: { role: 'super_admin' }, companyId: CHILD_A }
    expect(await findInScope(su, modelWith(row), 'r1')).toBeNull()
  })

  it('does not block models that carry no companyId column', async () => {
    // Join tables are reached through an already-scoped parent.
    const row = { id: 'r1' }
    expect(await findInScope(employee(CHILD_A), modelWith(row), 'r1')).toBe(row)
  })
})

/*
|--------------------------------------------------------------------------
| Group hierarchy
|--------------------------------------------------------------------------
| Oversight looks DOWN the tree; role inheritance looks UP it. Confusing
| the two is how a company ends up able to read a sibling's data.
*/
describe('company hierarchy', () => {
  it('finds descendants at every depth, excluding the root itself', async () => {
    const ids = await getDescendantIds(PARENT)
    expect(new Set(ids)).toEqual(new Set([CHILD_A, CHILD_B, GRANDCHILD]))
    expect(ids).not.toContain(PARENT)
  })

  it('never reaches an unrelated top-level company', async () => {
    expect(await getDescendantIds(PARENT)).not.toContain(UNRELATED)
  })

  it('walks ancestors upward, nearest parent first', async () => {
    expect(await getAncestorIds(GRANDCHILD)).toEqual([CHILD_A, PARENT])
  })

  it('reports children correctly', async () => {
    expect(await hasChildren(PARENT)).toBe(true)
    expect(await hasChildren(GRANDCHILD)).toBe(false)
  })
})

/*
|--------------------------------------------------------------------------
| Role inheritance
|--------------------------------------------------------------------------
| A child may use roles defined above it, so the group can define
| Administrator/Manager once. It must NOT reach sideways.
*/
describe('getRoleScopeIds — upward only', () => {
  it('includes the company itself and every ancestor', async () => {
    expect(new Set(await getRoleScopeIds(GRANDCHILD))).toEqual(
      new Set([GRANDCHILD, CHILD_A, PARENT])
    )
  })

  it('never includes a sibling', async () => {
    expect(await getRoleScopeIds(CHILD_A)).not.toContain(CHILD_B)
  })

  it('never includes a descendant', async () => {
    // The parent must not silently inherit a subsidiary's private roles.
    expect(await getRoleScopeIds(PARENT)).toEqual([PARENT])
  })
})

/*
|--------------------------------------------------------------------------
| Cycle guard
|--------------------------------------------------------------------------
| A loop in parentId makes every rollup silently wrong rather than
| erroring, so it has to be refused at write time.
*/
describe('assertNoCycle', () => {
  it('refuses to make a company its own parent', async () => {
    expect(await assertNoCycle(CHILD_A, CHILD_A)).toMatch(/own parent/i)
  })

  it('refuses a parent that already sits below the company', async () => {
    expect(await assertNoCycle(PARENT, GRANDCHILD)).toMatch(/loop/i)
  })

  it('allows a legitimate reparent', async () => {
    expect(await assertNoCycle(UNRELATED, PARENT)).toBeNull()
  })

  it('allows promotion to top level', async () => {
    expect(await assertNoCycle(CHILD_A, null)).toBeNull()
  })
})

/*
|--------------------------------------------------------------------------
| Permission resolution
|--------------------------------------------------------------------------
| The role-level migration depended on these: the stored JSON is NOT the
| granted permission set. A role storing 22 keys resolved to 96, another
| storing 96 resolved to 11. Anything reading the raw column gets it
| backwards.
*/
describe('normalizePermissions — stored shape is not the granted set', () => {
  let normalizePermissions
  beforeEach(async () => {
    ;({ normalizePermissions } = await import('../config/permissions.js'))
  })

  it('expands a legacy module grant into every action', async () => {
    const granted = normalizePermissions({ leads: true })
    expect(granted.has('leads.view')).toBe(true)
    expect(granted.has('leads.delete')).toBe(true)
    expect(granted.size).toBeGreaterThan(1)
  })

  it('applies dependencies — an action implies view', async () => {
    expect(normalizePermissions({ 'leads.delete': true }).has('leads.view')).toBe(true)
  })

  it('lets an explicit deny beat a broad grant', async () => {
    const granted = normalizePermissions({ leads: true, 'leads.delete': false })
    expect(granted.has('leads.view')).toBe(true)
    expect(granted.has('leads.delete')).toBe(false)
  })

  it('ignores unknown keys rather than trusting them', async () => {
    expect(normalizePermissions({ 'nonsense.hack': true }).has('nonsense.hack')).toBe(false)
  })

  it('returns empty for an array, which is not a permission object', async () => {
    expect(normalizePermissions(['leads.view']).size).toBe(0)
  })
})

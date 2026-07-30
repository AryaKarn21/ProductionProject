import { describe as suite, it, expect, vi } from 'vitest'

/*
|--------------------------------------------------------------------------
| Auto-audit hooks
|--------------------------------------------------------------------------
|
| models/auditHooks.js records every create/update/delete across the
| business models. That is what makes the Group Console possible — and
| it also means every one of those writes passes through the redaction
| logic below.
|
| The risk being pinned down here is quiet and one-directional: if
| SENSITIVE_FIELDS ever loses an entry, password hashes and OAuth tokens
| start landing in audit_logs, which are readable by anyone holding
| auditlog.view or group.view. Nothing would fail, error, or look wrong
| — the secrets would simply be there.
|
| These are the pure parts of the hook, so no database is involved.
*/

// The module imports config/db.js transitively; stub it so no
// connection is attempted just to test string handling.
vi.mock('../config/db.js', () => ({
  sequelize: { addHook: () => {} },
}))

const { __testing } = await import('../models/auditHooks.js')
const { describe: label, buildUpdateDiff, snapshot, SENSITIVE_FIELDS, IGNORED_FIELDS, EXCLUDED_MODELS, MODEL_MODULE } =
  __testing

/** Minimal stand-in for a Sequelize instance. */
const fakeInstance = (values, changed = [], previous = {}) => ({
  dataValues: values,
  changed: () => changed,
  previous: (f) => previous[f],
})

suite('secrets never reach the audit trail', () => {
  it('redacts every sensitive field on create', () => {
    const inst = fakeInstance({
      id: 'u1',
      email: 'a@b.c',
      password: '$2a$12$realbcrypthash',
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      refreshTokenEnc: 'ya29.a0Af...',
    })
    const out = snapshot(inst)

    expect(out.password).toBe('[redacted]')
    expect(out.mfaSecret).toBe('[redacted]')
    expect(out.refreshTokenEnc).toBe('[redacted]')
    // Non-secret fields still recorded, or the trail is useless.
    expect(out.email).toBe('a@b.c')

    // Belt and braces: the real value must appear nowhere in the output.
    const serialised = JSON.stringify(out)
    expect(serialised).not.toContain('$2a$12$realbcrypthash')
    expect(serialised).not.toContain('JBSWY3DPEHPK3PXP')
  })

  it('redacts a sensitive field on update without leaking either value', () => {
    const inst = fakeInstance(
      { id: 'u1', password: 'NEW-hash' },
      ['password'],
      { password: 'OLD-hash' }
    )
    const diff = buildUpdateDiff(inst)

    expect(diff.password).toEqual({ before: '[redacted]', after: '[changed]' })
    const serialised = JSON.stringify(diff)
    expect(serialised).not.toContain('OLD-hash')
    expect(serialised).not.toContain('NEW-hash')
  })

  it('covers the credentials this codebase actually stores', () => {
    for (const field of ['password', 'mfaSecret', 'refreshToken', 'accessTokenEnc', 'smtpPassword']) {
      expect(SENSITIVE_FIELDS.has(field)).toBe(true)
    }
  })
})

suite('noise suppression', () => {
  it('produces no diff when only ignored bookkeeping changed', () => {
    // A login touches lastLogin; a role change bumps tokenVersion. Both
    // would otherwise create a contentless "user updated" row beside the
    // route's own, better-worded entry.
    const inst = fakeInstance(
      { id: 'u1', lastLogin: new Date(), tokenVersion: 4 },
      ['lastLogin', 'tokenVersion', 'updatedAt'],
      { lastLogin: new Date(0), tokenVersion: 3 }
    )
    expect(Object.keys(buildUpdateDiff(inst))).toHaveLength(0)
  })

  it('ignores a JSON column marked dirty but holding an identical value', () => {
    // Sequelize flags JSON/BLOB columns as changed on every save even
    // when the contents match, which produced "changed" rows with no
    // actual change.
    const same = { a: 1, b: [2, 3] }
    const inst = fakeInstance({ id: 'r1', permissions: { ...same } }, ['permissions'], {
      permissions: { ...same },
    })
    expect(buildUpdateDiff(inst).permissions).toBeUndefined()
  })

  it('still reports a real change', () => {
    const inst = fakeInstance({ id: 'l1', stage: 'Qualified' }, ['stage'], { stage: 'New' })
    expect(buildUpdateDiff(inst).stage).toEqual({ before: 'New', after: 'Qualified' })
  })
})

suite('record labelling', () => {
  it('joins first and last name so the feed reads as a person', () => {
    expect(label(fakeInstance({ firstName: 'Sita', lastName: 'Sharma' }))).toBe('Sita Sharma')
  })

  it('falls back through the label fields in order', () => {
    expect(label(fakeInstance({ subject: 'Printer broken' }))).toBe('Printer broken')
    expect(label(fakeInstance({ poNumber: 'PO-114' }))).toBe('PO-114')
  })

  it('returns null when nothing is nameable, rather than inventing one', () => {
    expect(label(fakeInstance({ id: 'x', quantity: 4 }))).toBeNull()
  })

  it('truncates a long label instead of storing an essay in a VARCHAR(255)', () => {
    expect(label(fakeInstance({ name: 'x'.repeat(400) })).length).toBeLessThanOrEqual(160)
  })
})

suite('recursion and scope guards', () => {
  it('excludes AuditLog itself, or every audit row would audit itself forever', () => {
    expect(EXCLUDED_MODELS.has('AuditLog')).toBe(true)
  })

  it('excludes high-churn models that would drown the feed', () => {
    for (const m of ['Notification', 'OTP', 'PasswordResetToken', 'EmailEvent']) {
      expect(EXCLUDED_MODELS.has(m)).toBe(true)
    }
  })

  it('maps the business models onto the modules the console filters by', () => {
    expect(MODEL_MODULE.Lead).toBe('crm')
    expect(MODEL_MODULE.Expense).toBe('finance')
    expect(MODEL_MODULE.Employee).toBe('hr')
    expect(MODEL_MODULE.Ticket).toBe('support')
  })

  it('keeps tokenVersion out of the diff as bookkeeping, not a secret', () => {
    // It is a counter, not a credential — but auditing it produced a
    // duplicate row on every role change, so it belongs in IGNORED.
    expect(IGNORED_FIELDS.has('tokenVersion')).toBe(true)
    expect(SENSITIVE_FIELDS.has('tokenVersion')).toBe(false)
  })
})

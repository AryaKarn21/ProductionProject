-- ============================================================
--  Repair accounts that have no home company
-- ============================================================
--
--  POST /auth/register creates a user with role 'employee' and
--  companyId = NULL. Nine such accounts had accumulated. They split
--  into two groups needing OPPOSITE treatment:
--
--    A) 3 accounts have no home company but DO have a membership.
--       resolveCompany() falls back to the first membership, so these
--       work — their default tenant is just whichever membership the
--       database happens to return first. Fixed by DERIVING the home
--       company from the membership they already hold. This grants no
--       new access: it writes down where they already were.
--
--    B) 6 accounts have no home company AND no membership.
--       resolveCompany() rejects every request they make, so they can
--       authenticate and then do nothing at all. Deactivated.
--
--  Why B is deactivated rather than assigned: which company such a
--  user belongs to is a business fact that cannot be derived from the
--  data. Guessing would grant a real person access to a tenant's
--  records — the exact failure the tenant-isolation work in this
--  branch exists to prevent. Deactivating is the safe direction: it
--  grants nothing, changes nothing functionally (the accounts were
--  already unusable), and is undone with one click in
--  Settings -> Users once the right company is known.
--
--  To reverse B for a specific person:
--      UPDATE users SET isActive = 1, status = 'active'
--       WHERE email = '<their address>';
--    then assign them a company in Settings -> Users.
-- ============================================================


-- ── A1. Home company from the PRIMARY membership ────────────
-- Run first so an explicit primary always wins over an arbitrary one.
UPDATE users AS u
  JOIN user_companies AS uc
    ON uc.userId = u.id
   AND uc.isPrimary = 1
   AND (uc.isActive IS NULL OR uc.isActive <> 0)
   SET u.companyId = uc.companyId
 WHERE u.companyId IS NULL;


-- ── A2. Otherwise from any remaining active membership ──────
-- Only reached by users with no primary membership. Where somebody
-- holds several, MySQL picks one of them; any of their own companies
-- is a correct answer here, and the user can still switch tenants in
-- the app exactly as before.
UPDATE users AS u
  JOIN user_companies AS uc
    ON uc.userId = u.id
   AND (uc.isActive IS NULL OR uc.isActive <> 0)
   SET u.companyId = uc.companyId
 WHERE u.companyId IS NULL;


-- ── B. Deactivate the genuinely unusable accounts ───────────
-- `isActive = 1` keeps this idempotent: a second run finds nothing to
-- do and will not bump tokenVersion again.
-- super_admin is excluded on principle — never lock out the account
-- that would have to undo this.
UPDATE users AS u
   SET u.isActive     = 0,
       u.status       = 'inactive',
       -- Invalidates any token already issued to the account, so
       -- deactivation takes effect immediately rather than whenever
       -- the existing JWT happens to expire.
       u.tokenVersion = u.tokenVersion + 1
 WHERE u.companyId IS NULL
   AND u.isActive = 1
   AND u.role <> 'super_admin'
   AND NOT EXISTS (
     SELECT 1 FROM user_companies AS uc WHERE uc.userId = u.id
   );


SELECT
  (SELECT COUNT(*) FROM users WHERE companyId IS NULL)                      AS still_without_home_company,
  (SELECT COUNT(*) FROM users WHERE companyId IS NULL AND isActive = 1)     AS still_without_and_active,
  (SELECT COUNT(*) FROM users WHERE isActive = 0)                           AS inactive_total;

-- ============================================================
--  Move the system roles to the group parent
-- ============================================================
--
--  seed.js created Administrator / Manager / Accountant / Employee
--  owned by "OS Group". Once the hierarchy was linked, "OS Group"
--  became a CHILD of "OS Group of Companies" — so those four roles
--  lived on a sibling of every other company, not above them.
--
--  Role inheritance (utils/companyTree.js getRoleScopeIds) is strictly
--  upward: a company may use roles owned by itself or any ancestor,
--  never a sibling. So from "thee" or "Arya ltd" the four system roles
--  were unreachable — invisible in the Roles screen and rejected by
--  assertCanAssignRole(), even though 11 users already held them.
--
--  Moving them to the parent puts them above every company in the
--  group, which is where system roles belong.
--
--  This changes ONLY roles.companyId. No permission blob, no level, no
--  user assignment is touched, so nobody's effective access changes —
--  the same roleId keeps resolving to the same permissions.
--
--  Note: the parent already owns unrelated level-0 roles also named
--  "Manager" and "Employee". They are deliberately left alone, so the
--  parent's role list will show two of each until they are tidied up
--  in Settings -> Roles. Name uniqueness is enforced at creation time
--  by nameTaken(), not by a database constraint, so the duplicates are
--  harmless.
--
--  To reverse:
--      UPDATE roles SET companyId = (SELECT id FROM companies
--                                     WHERE name = 'OS Group')
--       WHERE isSystem = 1;
-- ============================================================

-- Self-contained (no session variables): migrations/run.js issues each
-- statement on a pooled connection, where a SET @var would not carry
-- over. If either company is missing the JOIN matches nothing and this
-- is a no-op rather than a destructive partial update.
--
-- Idempotent: after a successful run no isSystem role is owned by
-- "OS Group" any more, so re-running matches zero rows.
UPDATE roles AS r
  JOIN (
    SELECT id FROM (
      SELECT id FROM companies WHERE name = 'OS Group of Companies' LIMIT 1
    ) AS p
  ) AS parent
  JOIN (
    SELECT id FROM (
      SELECT id FROM companies WHERE name = 'OS Group' LIMIT 1
    ) AS o
  ) AS old_owner
   SET r.companyId = parent.id
 WHERE r.isSystem = 1
   AND r.isDeleted = 0
   AND r.companyId = old_owner.id;

SELECT
  c.name AS owner,
  COUNT(*) AS system_roles
FROM roles r
JOIN companies c ON c.id = r.companyId
WHERE r.isSystem = 1 AND r.isDeleted = 0
GROUP BY c.name;

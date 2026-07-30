-- ============================================================
--  Link the group hierarchy
-- ============================================================
--
--  Places every other company under "OS Group of Companies", which is
--  the parent company of the group. This is what populates the Group
--  Console: middleware/groupScope.js resolves a caller's scope by
--  walking companies.parentId downward from their own company.
--
--  Idempotent in the safe direction: it only fills in a parentId that
--  is currently NULL. Re-running will not overwrite a parent that has
--  since been changed by hand or through Settings -> Companies.
--
--  To move a company back out of the group later:
--      UPDATE companies SET parentId = NULL WHERE name = '<company>';
-- ============================================================

-- Deliberately NOT written with a session variable (SET @parent := ...).
-- migrations/run.js issues each statement through Sequelize's connection
-- pool, and a user variable set on one pooled connection is not visible
-- on the next — @parent would read back NULL and the UPDATE would
-- silently do nothing. Everything below is self-contained per statement.
--
-- The derived-table wrapper (… ) AS p is required: MySQL refuses to
-- SELECT from the same table it is UPDATE-ing unless the subquery is
-- materialised first.
--
-- If no company is named 'OS Group of Companies' the subquery yields
-- NULL, and the `parent.id IS NOT NULL` join condition means zero rows
-- match — so a missing parent is a no-op, never a flattened hierarchy.
UPDATE companies AS c
  JOIN (
    SELECT id FROM (
      SELECT id FROM companies WHERE name = 'OS Group of Companies' LIMIT 1
    ) AS inner_p
  ) AS parent
   SET c.parentId = parent.id
 WHERE c.id <> parent.id
   AND c.parentId IS NULL;

SELECT
  (SELECT COUNT(*) FROM companies WHERE parentId IS NOT NULL) AS linked_children,
  (SELECT COUNT(*) FROM companies WHERE parentId IS NULL)     AS top_level_remaining;

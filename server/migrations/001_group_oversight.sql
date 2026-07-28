-- ============================================================
--  Group oversight — schema changes
-- ============================================================
--
--  Adds the two columns the automatic audit trail needs, and the
--  indexes the Group Console queries rely on.
--
--  Safe to run more than once: every statement checks first.
--  server.js does NOT sync the schema automatically (that would be
--  reckless against production data) — run this file instead:
--
--    mysql -h <host> -u <user> -p <database> < migrations/001_group_oversight.sql
--
--  Requires MySQL 5.7+ / MariaDB 10.2+ for the JSON column already in
--  use by audit_logs.changes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. audit_logs.resourceLabel
--    A human-readable name for the affected record, captured at write
--    time. Without it the activity feed can only show a UUID — and one
--    that may no longer resolve if the record was later deleted.
-- ------------------------------------------------------------
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'audit_logs'
        AND COLUMN_NAME = 'resourceLabel'
    ),
    'SELECT ''audit_logs.resourceLabel already exists'' AS note',
    'ALTER TABLE audit_logs ADD COLUMN resourceLabel VARCHAR(255) NULL AFTER resourceId'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ------------------------------------------------------------
-- 2. audit_logs.source
--    'auto'  — written by the global Sequelize hooks
--    'route' — written explicitly by a route
--    Existing rows all predate the hooks, so they default to 'route'.
-- ------------------------------------------------------------
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'audit_logs'
        AND COLUMN_NAME = 'source'
    ),
    'SELECT ''audit_logs.source already exists'' AS note',
    'ALTER TABLE audit_logs ADD COLUMN source ENUM(''auto'',''route'') NOT NULL DEFAULT ''route'''
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ------------------------------------------------------------
-- 3. companies.parentId
--    Already declared on the Sequelize model, but it may never have
--    been created on databases that were built while server.js was
--    skipping sync(). Added here so the hierarchy has somewhere to live.
-- ------------------------------------------------------------
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'companies'
        AND COLUMN_NAME = 'parentId'
    ),
    'SELECT ''companies.parentId already exists'' AS note',
    'ALTER TABLE companies ADD COLUMN parentId CHAR(36) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ------------------------------------------------------------
-- 4. Indexes
--    The Group Console filters audit_logs by a LIST of company ids and
--    sorts by createdAt; getDescendantIds() walks companies.parentId.
--    Without these both are full table scans on a table that only grows.
-- ------------------------------------------------------------
-- Checked by COLUMN, not by index name: this database already has an
-- index on companies.parentId called `parentId`. Matching on a name we
-- chose ourselves would not have found it and would have created a
-- second, redundant index over the same column.
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'companies'
        AND COLUMN_NAME = 'parentId'
    ),
    'SELECT ''companies.parentId is already indexed'' AS note',
    'CREATE INDEX companies_parent_id ON companies (parentId)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'audit_logs'
        AND INDEX_NAME = 'audit_logs_company_id_created_at'
    ),
    'SELECT ''audit_logs_company_id_created_at already exists'' AS note',
    'CREATE INDEX audit_logs_company_id_created_at ON audit_logs (companyId, createdAt)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'audit_logs'
        AND INDEX_NAME = 'audit_logs_module'
    ),
    'SELECT ''audit_logs_module already exists'' AS note',
    'CREATE INDEX audit_logs_module ON audit_logs (module)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================
--  After running this, link your child companies to the parent:
--
--    UPDATE companies
--       SET parentId = (SELECT id FROM (SELECT id FROM companies
--                                        WHERE name = 'OS Group') AS p)
--     WHERE name IN ('Child Company A', 'Child Company B');
--
--  Or do it in the UI: Settings -> Companies -> Edit -> Parent Company.
-- ============================================================

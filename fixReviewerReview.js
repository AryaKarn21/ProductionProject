// ─────────────────────────────────────────────────────────────────────────
// One-time repair script.
//
// performance_reviews.reviewerId USED to be a foreign key into `users`.
// The application code was later changed so reviewerId stores an
// `employees.id` instead — but that only changed the JS model association.
// sequelize.sync({ alter: true }) does not rewrite existing foreign key
// constraints, so the database is still enforcing "reviewerId must exist
// in users", which is why every performance review submission fails with
// a foreign key constraint error even though the application code is
// correct.
//
// This script finds that stale constraint and replaces it with the
// correct one (reviewerId -> employees.id). It is safe to run more than
// once — it does nothing if the constraint is already correct.
//
// Usage (from the server/ folder):
//   node fixReviewerForeignKey.js
//
// Take a database backup first if you want to be extra safe, though this
// only touches the constraint metadata, not any row data.
// ─────────────────────────────────────────────────────────────────────────

import { sequelize } from "./config/db.js";

const TABLE = "performance_reviews";
const COLUMN = "reviewerId";
const CORRECT_TARGET_TABLE = "employees";

async function run() {
  await sequelize.authenticate();
  console.log("Connected to database.");

  const [rows] = await sequelize.query(
    `
    SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = :table
      AND COLUMN_NAME = :column
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `,
    { replacements: { table: TABLE, column: COLUMN } },
  );

  if (!rows.length) {
    console.log(
      `No foreign key found on ${TABLE}.${COLUMN}. Nothing to inspect — ` +
        `it may already have been dropped, or sync() hasn't created one yet.`,
    );
    process.exit(0);
  }

  const existing = rows[0];

  if (existing.REFERENCED_TABLE_NAME === CORRECT_TARGET_TABLE) {
    console.log(
      `${TABLE}.${COLUMN} already correctly references ` +
        `${CORRECT_TARGET_TABLE}. Nothing to fix.`,
    );
    process.exit(0);
  }

  console.log(
    `Found stale foreign key "${existing.CONSTRAINT_NAME}" on ` +
      `${TABLE}.${COLUMN} referencing "${existing.REFERENCED_TABLE_NAME}" ` +
      `(should reference "${CORRECT_TARGET_TABLE}"). Fixing...`,
  );

  await sequelize.query(
    `ALTER TABLE \`${TABLE}\` DROP FOREIGN KEY \`${existing.CONSTRAINT_NAME}\``,
  );
  console.log(`Dropped old constraint "${existing.CONSTRAINT_NAME}".`);

  await sequelize.query(
    `
    ALTER TABLE \`${TABLE}\`
    ADD CONSTRAINT \`performance_reviews_reviewerId_fk\`
    FOREIGN KEY (\`${COLUMN}\`) REFERENCES \`${CORRECT_TARGET_TABLE}\`(\`id\`)
    `,
  );
  console.log(
    `Added new constraint "performance_reviews_reviewerId_fk" ` +
      `(${TABLE}.${COLUMN} -> ${CORRECT_TARGET_TABLE}.id).`,
  );

  console.log("Done. Performance review submissions should work now.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to fix the reviewerId foreign key:");
  console.error(err);
  process.exit(1);
});
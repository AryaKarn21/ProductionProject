import '../env.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sequelize } from '../config/db.js'

/*
|--------------------------------------------------------------------------
| Migration runner
|--------------------------------------------------------------------------
|
| Applies every .sql file in this directory, in filename order, using the
| same DB credentials the app itself uses.
|
|   npm run migrate
|
| Every migration in this folder is written to be idempotent (each
| statement checks whether its change is already present), so re-running
| is safe and is the intended way to bring a database up to date.
|
| This exists because server.js deliberately does NOT sync the schema on
| boot — sequelize.sync({ alter: true }) against live data can drop or
| retype columns without warning. Explicit, reviewable SQL is the right
| tool for a production database.
*/

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Splits a file into statements.
 *
 * Three things a naive `sql.split(';')` gets wrong, all of which this
 * handles:
 *
 *   1. PREPARE/EXECUTE blocks put several statements on one line —
 *      splitting on ';' is right, but only outside quotes and comments.
 *   2. A ';' inside a quoted string is data, not a terminator.
 *   3. A ';' inside a `--` comment is prose. Explanatory comments in a
 *      migration routinely contain one, and treating it as a terminator
 *      cuts the comment loose as its own "statement", which the server
 *      then rejects as a syntax error.
 */
const splitStatements = (sql) => {
  const statements = []
  let current = ''
  let quote = null

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    const next = sql[i + 1]

    if (quote) {
      current += char
      // '' is an escaped quote inside a MySQL string literal.
      if (char === quote) {
        if (next === quote) {
          current += sql[++i]
        } else {
          quote = null
        }
      }
      continue
    }

    // ── Line comment: -- or # ──────────────────────────────────
    // Consumed whole, so nothing inside it can terminate a statement.
    if ((char === '-' && next === '-') || char === '#') {
      while (i < sql.length && sql[i] !== '\n') i++
      current += '\n'
      continue
    }

    // ── Block comment: /* … */ ────────────────────────────────
    if (char === '/' && next === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i++ // land on the '/'
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      current += char
      continue
    }

    if (char === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) statements.push(current.trim())

  return statements
}

const run = async () => {
  await sequelize.authenticate()
  console.log(`Connected to ${process.env.DB_NAME} at ${process.env.DB_HOST}\n`)

  const files = fs
    .readdirSync(here)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log('No .sql migrations found.')
    return
  }

  for (const file of files) {
    console.log(`── ${file}`)
    const sql = fs.readFileSync(path.join(here, file), 'utf8')
    const statements = splitStatements(sql)

    for (const statement of statements) {
      try {
        // `logging: false` because config/db.js echoes every query, and
        // these statements are 15-line PREPARE blocks — the echo buries
        // the one line that matters (whether the change was applied).
        const [rows] = await sequelize.query(statement, { logging: false })
        // The idempotency checks return a `note` row when the change was
        // already applied; surface it so the run is self-explanatory.
        const note = Array.isArray(rows) && rows[0]?.note
        if (note) console.log(`   · ${note}`)
      } catch (err) {
        console.error(`\n   ✗ Failed on statement:\n${statement}\n`)
        throw err
      }
    }

    console.log(`   ✓ applied\n`)
  }

  console.log('Migrations complete.')
}

run()
  .then(async () => {
    await sequelize.close()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('Migration failed:', err.message)
    await sequelize.close().catch(() => {})
    process.exit(1)
  })

/*
|--------------------------------------------------------------------------
| Request validation
|--------------------------------------------------------------------------
|
| The original version of this file called `schema.parseAsync(req.body)`,
| which is Zod's API — but Zod was never installed and the middleware was
| never imported anywhere. Rather than add a dependency, this version
| ships a small built-in validator, while still accepting a Zod schema if
| you decide to install Zod later.
|
| Usage:
|
|   import { validate, rules } from '../middleware/validate.js'
|
|   router.post('/', validate({
|     name:  rules.string({ required: true, min: 2, max: 100 }),
|     email: rules.email({ required: true }),
|     roleId: rules.uuid(),
|   }), handler)
|
| On success the sanitised values replace req.body, so handlers can rely
| on types being correct. On failure a 400 is returned listing every
| offending field.
*/

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const isEmpty = (v) => v === undefined || v === null || v === ''

export const rules = {
  string:
    ({ required = false, min = 0, max = 5000, trim = true } = {}) =>
    (value, field) => {
      if (isEmpty(value)) {
        if (required) return { error: `${field} is required` }
        return { value: undefined }
      }
      if (typeof value !== 'string') return { error: `${field} must be text` }
      const out = trim ? value.trim() : value
      if (out.length < min)
        return { error: `${field} must be at least ${min} characters` }
      if (out.length > max)
        return { error: `${field} must be at most ${max} characters` }
      return { value: out }
    },

  email:
    ({ required = false } = {}) =>
    (value, field) => {
      if (isEmpty(value)) {
        if (required) return { error: `${field} is required` }
        return { value: undefined }
      }
      const out = String(value).trim().toLowerCase()
      if (!EMAIL_RE.test(out)) return { error: `${field} must be a valid email address` }
      return { value: out }
    },

  uuid:
    ({ required = false, nullable = true } = {}) =>
    (value, field) => {
      if (isEmpty(value)) {
        if (required) return { error: `${field} is required` }
        return { value: nullable && value === null ? null : undefined }
      }
      if (!UUID_RE.test(String(value)))
        return { error: `${field} must be a valid id` }
      return { value: String(value) }
    },

  boolean:
    ({ required = false } = {}) =>
    (value, field) => {
      if (isEmpty(value)) {
        if (required) return { error: `${field} is required` }
        return { value: undefined }
      }
      if (typeof value === 'boolean') return { value }
      if (value === 'true') return { value: true }
      if (value === 'false') return { value: false }
      return { error: `${field} must be true or false` }
    },

  integer:
    ({ required = false, min = -Infinity, max = Infinity } = {}) =>
    (value, field) => {
      if (isEmpty(value)) {
        if (required) return { error: `${field} is required` }
        return { value: undefined }
      }
      const n = Number(value)
      if (!Number.isInteger(n)) return { error: `${field} must be a whole number` }
      if (n < min) return { error: `${field} must be at least ${min}` }
      if (n > max) return { error: `${field} must be at most ${max}` }
      return { value: n }
    },

  enumOf:
    (allowed, { required = false } = {}) =>
    (value, field) => {
      if (isEmpty(value)) {
        if (required) return { error: `${field} is required` }
        return { value: undefined }
      }
      if (!allowed.includes(value))
        return { error: `${field} must be one of: ${allowed.join(', ')}` }
      return { value }
    },

  array:
    ({ required = false, of = null, max = 500 } = {}) =>
    (value, field) => {
      if (isEmpty(value)) {
        if (required) return { error: `${field} is required` }
        return { value: undefined }
      }
      if (!Array.isArray(value)) return { error: `${field} must be a list` }
      if (value.length > max)
        return { error: `${field} may contain at most ${max} items` }
      if (!of) return { value }

      const out = []
      for (let i = 0; i < value.length; i++) {
        const res = of(value[i], `${field}[${i}]`)
        if (res.error) return { error: res.error }
        out.push(res.value)
      }
      return { value: out }
    },

  object:
    ({ required = false } = {}) =>
    (value, field) => {
      if (isEmpty(value)) {
        if (required) return { error: `${field} is required` }
        return { value: undefined }
      }
      if (typeof value !== 'object' || Array.isArray(value))
        return { error: `${field} must be an object` }
      return { value }
    },

  password:
    ({ required = true, min = 8 } = {}) =>
    (value, field) => {
      if (isEmpty(value)) {
        if (required) return { error: `${field} is required` }
        return { value: undefined }
      }
      const s = String(value)
      if (s.length < min)
        return { error: `${field} must be at least ${min} characters` }
      if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/[0-9]/.test(s)) {
        return {
          error: `${field} must contain an uppercase letter, a lowercase letter and a number`,
        }
      }
      return { value: s }
    },
}

/**
 * validate(schema, source)
 * @param schema  either a rules-map, or a Zod schema (auto-detected)
 * @param source  'body' | 'query' | 'params'
 */
export const validate =
  (schema, source = 'body') =>
  async (req, res, next) => {
    try {
      // Zod compatibility — if somebody installs Zod later, existing
      // call sites keep working unchanged.
      if (schema && typeof schema.parseAsync === 'function') {
        req[source] = await schema.parseAsync(req[source])
        return next()
      }

      const input = req[source] || {}
      const output = {}
      const errors = []

      for (const [field, rule] of Object.entries(schema)) {
        const result = rule(input[field], field)
        if (result.error) errors.push({ field, message: result.error })
        else if (result.value !== undefined) output[field] = result.value
      }

      if (errors.length) {
        return res.status(400).json({ message: 'Validation failed', errors })
      }

      // Only validated fields survive. This is a second line of defence
      // against mass assignment: an unexpected `role` or `tokenVersion`
      // in the payload is dropped before it reaches the handler.
      if (source === 'body') req.body = output
      else req.validated = output

      next()
    } catch (err) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: err.errors?.map((e) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : e.path,
          message: e.message,
        })),
      })
    }
  }

/** Guards a route whose :id param must be a UUID. */
export const validateUuidParam =
  (param = 'id') =>
  (req, res, next) => {
    if (!UUID_RE.test(String(req.params[param] || ''))) {
      return res.status(400).json({ message: `Invalid ${param}` })
    }
    next()
  }

/** Normalises page/limit and caps limit so ?limit=999999 cannot be used to scrape. */
export const parsePagination = (req, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit))
  return { page, limit, offset: (page - 1) * limit }
}

export default validate
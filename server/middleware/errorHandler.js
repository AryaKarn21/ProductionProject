import crypto from "crypto";

/*
|--------------------------------------------------------------------------
| Error handler
|--------------------------------------------------------------------------
|
| The previous version returned `err.message` straight to the client for
| SequelizeDatabaseError and for any unhandled error. That handed
| attackers raw SQL fragments, table names and column names.
|
| Now: full detail goes to the server log with a reference id, and the
| client gets a safe message plus that id, so a user can quote it in a
| support ticket and you can find the exact stack trace.
*/

const isProd = () => process.env.NODE_ENV === "production";

export const errorHandler = (err, req, res, next) => {
  const errorId = crypto.randomUUID();

  // Full detail, server-side only.
  console.error(`[${errorId}] ${req.method} ${req.originalUrl}`);
  console.error(`[${errorId}] user: ${req.user?.id || "anonymous"}`);
  console.error(`[${errorId}]`, err.stack || err);

  console.error("===== ERROR =====");
console.error(err);
console.error(err.stack);

  // Validation failures are safe to surface — they describe the
  // caller's own input, not our schema.
  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      message: "Validation error",
      errors: err.errors.map((e) => e.message),
      errorId,
    });
  }

  if (err.name === "SequelizeUniqueConstraintError") {
    const field =
      err.errors?.[0]?.path || Object.keys(err.fields || {})[0] || "field";
    return res.status(409).json({
      message: `${field} already exists`,
      errorId,
    });
  }

  if (err.name === "SequelizeForeignKeyConstraintError") {
    return res.status(400).json({
      message: "Referenced record does not exist",
      errorId,
    });
  }

  // A malformed UUID or a type mismatch reaching the database is a bad
  // request, but the driver's message describes our schema — so it is
  // logged, not returned.
  if (
    err.name === "SequelizeDatabaseError" ||
    err.name === "SequelizeEagerLoadingError"
  ) {
    return res.status(400).json({
      message: "The request could not be processed. Please check your input.",
      errorId,
    });
  }

  if (err.name === "SequelizeConnectionError" || err.name === "SequelizeConnectionRefusedError") {
    return res.status(503).json({
      message: "Service temporarily unavailable. Please try again shortly.",
      errorId,
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large", errorId });
  }

  // Errors we raised ourselves carry a status and an intentional
  // message, so those are safe to pass through.
  const status = err.status || err.statusCode || 500;

  if (status < 500) {
    return res.status(status).json({
      message: err.message || "Request failed",
      errorId,
    });
  }

  return res.status(500).json({
    message: isProd()
      ? "Internal server error"
      : err.message || "Internal server error",
    errorId,
  });
};

/**
 * Small helper for throwing errors with an HTTP status attached, so
 * route handlers can `throw new AppError('Not allowed', 403)` instead
 * of hand-rolling a response.
 */
export class AppError extends Error {
  constructor(message, status = 400, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}



/** Catches 404s for unknown API paths before the error handler. */
export const notFoundHandler = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};




export default errorHandler;
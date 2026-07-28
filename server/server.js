import "./env.js"; // MUST be the first import — loads .env before anything else touches process.env

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { sequelize } from "./config/db.js";
import "./models/index.js"; // registers all associations before sync/queries run
import path from "path";
import fs from "fs";
import crypto from "crypto";

import authRoutes from "./routes/auth.routes.js";
import leadsRoutes from "./routes/leads.routes.js";
import accountsRoutes from "./routes/accounts.routes.js";
import contactsRoutes from "./routes/contacts.routes.js";
import opportunitiesRoutes from "./routes/opportunities.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import employeesRoutes from "./routes/employees.routes.js";
import performanceRoutes from "./routes/performance.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import shiftRoutes from "./routes/shifts.routes.js";
import leavesRoutes from "./routes/leaves.routes.js";
import holidayRoutes from "./routes/holiday.routes.js";
import payrollRoutes from "./routes/payroll.routes.js";
import financeRoutes from "./routes/finance.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import procurementRoutes from "./routes/procurement.routes.js";
import projectsRoutes from "./routes/projects.routes.js";
import supportRoutes from "./routes/support.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import rolesRoutes from "./routes/roles.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import groupRoutes from "./routes/group.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { protect } from "./middleware/auth.js";
import { resolveCompany } from "./middleware/tenant.js";
import { requestContext } from "./middleware/requestContext.js";
import meetingsRoutes from "./routes/meetings.routes.js";
import meetingAttendeeRoutes from "./routes/meetingAttendees.routes.js";
import usersRoutes from "./routes/users.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import emailRoutes from "./routes/email.routes.js";
import googleAuthRoutes from "./routes/googleAuth.routes.js";
import { startScheduler } from "./services/scheduler.service.js";

const app = express();

/*
|--------------------------------------------------------------------------
| Startup configuration check
|--------------------------------------------------------------------------
| Fail loudly at boot rather than as a confusing 500 on the first login.
*/
const REQUIRED_ENV = ["JWT_SECRET", "DB_NAME", "DB_USER", "DB_HOST"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`FATAL: missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error(
    "FATAL: JWT_SECRET is too short. Generate one with:\n" +
    '  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
  );
  process.exit(1);
}

/*
|--------------------------------------------------------------------------
| Leaked-credential guard
|--------------------------------------------------------------------------
| server/.env was committed in 323f0ff ("Initial commit") to a PUBLIC
| repository, exposing the production JWT_SECRET and database password.
| Anyone holding the old JWT_SECRET can forge a token for any user,
| including super_admin, which defeats every authorisation check in this
| codebase; the database password grants direct access, bypassing the
| application entirely.
|
| Both were rotated. This guard refuses to start if a leaked value ever
| comes back — from an old backup, a stale deploy, a teammate's copy of
| .env, or a restored snapshot. Silent reintroduction is the realistic
| failure mode, and it would be invisible without this.
|
| The values are compared as SHA-256 digests so the secrets themselves
| are not reintroduced into the repository in plaintext. A digest is
| useless to an attacker who does not already have the secret — and one
| who does can read it in the public git history anyway.
*/
const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

/*
 * JWT_SECRET is FATAL.
 *
 * The API is the attack surface here: anyone with the old secret can
 * mint a token for any user, including super_admin, and every
 * authorisation check in this codebase then passes. Refusing to start
 * genuinely removes that. Rotating costs nothing — generate a new
 * random string — so failing closed is cheap and correct.
 */
const LEAKED_JWT_SECRET =
  "5f3695c6065041289cdfade7938338e3be58e2ac0d23782d52655361a42e1e8e";

if (process.env.JWT_SECRET && sha256(process.env.JWT_SECRET) === LEAKED_JWT_SECRET) {
  console.error(
    "\nFATAL: JWT_SECRET is the value published in this repository's " +
    "public git history.\n" +
    "Anyone holding it can forge a token for any user, including " +
    "super_admin.\n\n" +
    "  Generate a replacement:\n" +
    '    node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n\n' +
    "  Rotating signs every user out. That is intended — tokens forged\n" +
    "  with the old secret stop working immediately.\n"
  );
  process.exit(1);
}

/*
 * DB_PASSWORD is a WARNING, deliberately not fatal.
 *
 * Refusing to boot would not protect anything. An attacker holding the
 * database password connects to MySQL directly and never touches this
 * process — so failing closed here costs a working environment and buys
 * no security whatsoever. The only real fix is rotating it in the
 * hosting panel, and nagging loudly on every start is the honest way to
 * keep that visible without breaking the app in the meantime.
 */
const LEAKED_DB_PASSWORD =
  "2c321e183c3e756d60538f38cee0d2352e0174abfca8ad602171b80d77295e38";

if (process.env.DB_PASSWORD && sha256(process.env.DB_PASSWORD) === LEAKED_DB_PASSWORD) {
  console.warn(
    "\n" + "!".repeat(72) + "\n" +
    "  SECURITY: DB_PASSWORD is the value published in this repository's\n" +
    "  public git history. Anyone who has seen the repo can connect to\n" +
    "  this database directly and read or modify every company's data,\n" +
    "  bypassing the application entirely.\n\n" +
    "  Rotate it in Hostinger -> Databases, update DB_PASSWORD, restart.\n" +
    "!".repeat(72) + "\n"
  );
}

/*
|--------------------------------------------------------------------------
| Proxy trust
|--------------------------------------------------------------------------
| Required for req.ip to be correct — and therefore for the IP address in
| the audit log to be trustworthy. Set TRUST_PROXY in .env to the number
| of proxies in front of the app (1 for a single nginx / load balancer).
| Leave unset when the app is directly exposed.
*/
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));
app.disable("x-powered-by");

/*
|--------------------------------------------------------------------------
| Security headers
|--------------------------------------------------------------------------
*/
app.use(
  helmet({
    // The API and the Vite dev server are on different origins, so
    // cross-origin resource policy has to allow it.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // the SPA is served separately by Vite/nginx
  })
);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
| Was `app.use(cors())` — every origin on the internet was allowed to
| call this API. Now restricted to an explicit allowlist from .env:
|   CORS_ORIGINS=http://localhost:5173,https://crm.osgroup.com
*/
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No origin = same-origin request, curl, or a mobile app.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Company-ID"],
    exposedHeaders: ["Content-Disposition"],
  })
);

/*
|--------------------------------------------------------------------------
| Body parsing — with a size limit
|--------------------------------------------------------------------------
| express.json() defaults to 100kb in Express 5, but being explicit
| documents the intent and keeps it stable across upgrades.
*/
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/*
|--------------------------------------------------------------------------
| Rate limiting
|--------------------------------------------------------------------------
*/
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count towards the limit
  message: { message: "Too many attempts. Please try again in 15 minutes." },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification requests. Please try again later." },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});

// Strictest limits on the endpoints an attacker hammers first.
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth/send-otp", otpLimiter);
app.use("/api/auth/verify-otp", otpLimiter);
app.use("/api", apiLimiter);

/*
|--------------------------------------------------------------------------
| Uploaded files — authenticated only
|--------------------------------------------------------------------------
| Was `app.use("/uploads", express.static(...))` with no auth at all, so
| expense receipts, employee documents and email attachments were
| downloadable by anyone who guessed a filename.
|
| `protect` now runs first. A per-file ownership check belongs in the
| individual download routes (finance already has one); this closes the
| open directory.
*/
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const avatarsDir = path.join(uploadsDir, "avatars");
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

// Profile pictures are low-sensitivity and are rendered as plain <img src>
// tags all over the app (profile header, employee list, attendance logs,
// leave requests) — an <img> tag cannot attach the Bearer token the rest
// of /uploads requires, and the attachment disposition below would force
// a download dialog instead of displaying the image. So this narrow path
// is public and inline; everything else under /uploads stays protected.
app.use(
  "/uploads/avatars",
  express.static(avatarsDir, {
    dotfiles: "deny",
    index: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "public, max-age=86400");
    },
  })
);

app.use(
  "/uploads",
  protect,
  express.static(uploadsDir, {
    dotfiles: "deny",
    index: false,
    setHeaders: (res) => {
      // Stops an uploaded .html or .svg from executing in the user's
      // session if it is opened directly.
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "attachment");
    },
  })
);

/*
|--------------------------------------------------------------------------
| Tenant chain
|--------------------------------------------------------------------------
| Every protected router runs the same three middlewares, in this order:
|
|   protect         who is calling (JWT -> req.user, req.memberships)
|   resolveCompany  which tenant they may touch (-> req.companyId)
|   requestContext  publishes both into AsyncLocalStorage, so the audit
|                   hooks in models/auditHooks.js can attribute every
|                   write to a user and a company without each route
|                   having to pass `req` down to the model layer.
|
| requestContext MUST come after resolveCompany: before it runs,
| req.companyId does not exist yet and audit rows would be stamped with
| the user's home company instead of the one they are working in.
*/
const tenantChain = [protect, resolveCompany, requestContext];

app.use("/api/auth", authRoutes);

app.use("/api/meetings", ...tenantChain,meetingsRoutes);
app.use("/api/meeting-attendees", ...tenantChain,meetingAttendeeRoutes);

app.use("/api/leads", ...tenantChain,leadsRoutes);
app.use("/api/accounts", ...tenantChain,accountsRoutes);
app.use("/api/contacts", ...tenantChain,contactsRoutes);
app.use("/api/opportunities", ...tenantChain,opportunitiesRoutes);
app.use("/api/dashboard", ...tenantChain,dashboardRoutes);
app.use("/api/employees", ...tenantChain,employeesRoutes);
app.use("/api/performance", ...tenantChain,performanceRoutes);
app.use("/api/users", ...tenantChain,usersRoutes);
app.use("/api/attendance", ...tenantChain,attendanceRoutes);
app.use("/api/shifts", ...tenantChain,shiftRoutes);
app.use("/api/leaves", ...tenantChain,leavesRoutes);
app.use("/api/holidays", ...tenantChain, holidayRoutes);
app.use("/api/payroll", ...tenantChain,payrollRoutes);
app.use("/api/finance", ...tenantChain,financeRoutes);
app.use("/api/inventory", ...tenantChain,inventoryRoutes);
app.use("/api/procurement", ...tenantChain,procurementRoutes);
app.use("/api/projects", ...tenantChain,projectsRoutes);
app.use("/api/support", ...tenantChain,supportRoutes);
app.use("/api/reports", ...tenantChain,reportsRoutes);
app.use("/api/notifications", ...tenantChain,notificationsRoutes);

// SECURITY: resolveCompany was missing here, which is why every user
// endpoint under /api/settings ran with no tenant scope at all.
app.use("/api/settings", ...tenantChain,settingsRoutes);

app.use("/api/roles", ...tenantChain,rolesRoutes);
app.use("/api/audit-logs", ...tenantChain,auditRoutes);

// Parent-company oversight: read-only visibility across every company
// below the caller's own in the hierarchy. Scoped by middleware/groupScope.js.
app.use("/api/group", ...tenantChain, groupRoutes);

// Google OAuth for Gmail. Mounted BEFORE the protected email router: it
// applies `protect` per-route so the /google/callback redirect from Google
// (which has no Authorization header) can run unauthenticated and verify
// the signed `state` instead. All other /api/email/* paths fall through to
// the protected emailRoutes below.
app.use("/api/email", googleAuthRoutes);
app.use("/api/email", ...tenantChain,emailRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    console.log(`DB: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}`);

    await sequelize.authenticate();
    console.log("MySQL connected");

    /*
     * Schema sync.
     *
     * This block previously read DB_SYNC_ALTER into `alter`, logged
     * "Skipping sync", then logged "Database synced" anyway — and never
     * called sequelize.sync() at all. So the log said the schema was up
     * to date while nothing had touched it, and any newly added column
     * or table silently did not exist until someone ran the SQL by hand.
     *
     * Now it does what it says. Sync stays OFF by default because
     * alter-ing a live production schema on boot is dangerous; run the
     * checked-in migration instead (see migrations/), or set
     * DB_SYNC_ALTER=true in development to let Sequelize do it.
     */
    if (process.env.DB_SYNC_ALTER === "true") {
      await sequelize.sync({ alter: true });
      console.log("Database synced (ALTER applied)");
    } else {
      console.log(
        "Schema sync skipped (DB_SYNC_ALTER is not 'true'). " +
        "Apply pending changes with migrations/ if the app reports missing columns."
      );
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startScheduler();
    });
  } catch (err) {
    console.error("========== ERROR ==========");
    console.error(err);
    console.error(err.stack);
    console.error("===========================");
    process.exit(1);
  }
}

start();
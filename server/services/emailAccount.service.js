// ─────────────────────────────────────────────────────────────
// EMAIL ACCOUNT SERVICE
// Connect / verify / manage mailboxes (Gmail, Outlook, M365, SMTP, IMAP).
//
// Security rules enforced here:
//   1. Credentials are AES-256-GCM encrypted at rest (utils/crypto.js) and
//      NEVER returned to the client — sanitizeAccount() strips them.
//   2. Every lookup is company-scoped; non-admins only see their own mailbox.
//      (No findByPk on a tenant model — that would be an IDOR.)
//   3. Updates use an explicit allow-list — no update(req.body).
// ─────────────────────────────────────────────────────────────
import nodemailer from "nodemailer";
import { EmailAccount } from "../models/index.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { sequelize } from "../config/db.js";

// Host/port presets so users don't have to know provider settings.
const PROVIDER_PRESETS = {
  gmail: {
    smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false,
    imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true,
  },
  outlook: {
    smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false,
    imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true,
  },
  microsoft365: {
    smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false,
    imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true,
  },
  smtp: {}, // caller supplies host/port
  imap: {},
};

// Columns a client is allowed to set. Anything else in req.body is ignored.
const WRITABLE_FIELDS = [
  "displayName", "email", "provider", "authType",
  "smtpHost", "smtpPort", "smtpSecure",
  "imapHost", "imapPort", "imapSecure",
  "syncEnabled",
];

const SECRET_FIELDS = ["encPassword", "encAccessToken", "encRefreshToken"];

/** Strip encrypted credentials before anything is sent to the client. */
export const sanitizeAccount = (account) => {
  if (!account) return null;
  const plain = typeof account.toJSON === "function" ? account.toJSON() : { ...account };
  const hasCredentials = Boolean(plain.encPassword || plain.encAccessToken);
  SECRET_FIELDS.forEach((f) => delete plain[f]);
  return { ...plain, hasCredentials };
};

/**
 * Build the WHERE clause for account lookups.
 * - super_admin with no X-Company-ID header => req.companyId is null => no company filter.
 * - Regular users only ever see their own mailboxes.
 */
export const accountScope = (req) => {
  const where = {};
  if (req.companyId) where.companyId = req.companyId;
  if (!["admin", "super_admin"].includes(req.user.role)) {
    where.userId = req.user.id;
  }
  return where;
};

/** Merge provider defaults under any values the caller explicitly supplied. */
export const applyProviderPreset = (provider, data = {}) => {
  const preset = PROVIDER_PRESETS[provider] || {};
  const merged = { ...preset };
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null && value !== "") merged[key] = value;
  }
  return merged;
};

/** Nodemailer transporter for a stored account (decrypts on the fly). */
/** Nodemailer transporter for a stored account (decrypts on the fly). */
export const buildTransporter = (account) => {
  // OAuth2 (Gmail) accounts: authenticate with the encrypted refresh token.
  // Nodemailer's XOAUTH2 support uses clientId/clientSecret + refreshToken to
  // mint a fresh access token automatically whenever the current one has
  // expired — so users are never forced to reconnect over a stale token.
  if (account.authType === "oauth2" && account.provider === "gmail") {
    const refreshToken = decrypt(account.encRefreshToken);
    const accessToken = decrypt(account.encAccessToken);
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "OAuth2",
        user: account.email,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken,
        // Optional: seed the current token so nodemailer can skip a refresh
        // round-trip when it is still valid. Omitted safely if null.
        ...(accessToken ? { accessToken } : {}),
      },
    });
  }

  // Legacy SMTP + app-password accounts.
  const password = decrypt(account.encPassword);
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: Number(account.smtpPort),
    secure: Boolean(account.smtpSecure),
    auth: { user: account.email, pass: password },
  });
};

/** Verify SMTP credentials. Returns { ok } or { ok:false, error }. */
export const verifySmtp = async ({ smtpHost, smtpPort, smtpSecure, email, password }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: Boolean(smtpSecure),
      auth: { user: email, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

/** Only one default mailbox per user per company. */
const clearOtherDefaults = async (companyId, userId, exceptId, transaction) => {
  await EmailAccount.update(
    { isDefault: false },
    { where: { companyId, userId }, transaction }
  );
  if (exceptId) {
    await EmailAccount.update({ isDefault: true }, { where: { id: exceptId }, transaction });
  }
};

// ── CRUD ─────────────────────────────────────────────────────

export const listAccounts = async (req) => {
  const accounts = await EmailAccount.findAll({
    where: accountScope(req),
    order: [["isDefault", "DESC"], ["createdAt", "DESC"]],
  });
  return accounts.map(sanitizeAccount);
};

export const getAccount = async (req, id) => {
  const account = await EmailAccount.findOne({ where: { id, ...accountScope(req) } });
  return account; // raw model — caller sanitizes or uses internally
};

export const createAccount = async (req, body) => {
  // companyId is NOT NULL — a super_admin browsing "all companies" must pick one first.
  if (!req.companyId) {
    const err = new Error("Select a company before connecting a mailbox.");
    err.status = 400;
    throw err;
  }

  const { provider, email, password, displayName, skipVerify } = body;
  if (!provider || !email) {
    const err = new Error("provider and email are required.");
    err.status = 400;
    throw err;
  }
  if (!PROVIDER_PRESETS[provider]) {
    const err = new Error(`Unsupported provider "${provider}".`);
    err.status = 400;
    throw err;
  }

  const settings = applyProviderPreset(provider, {
    smtpHost: body.smtpHost, smtpPort: body.smtpPort, smtpSecure: body.smtpSecure,
    imapHost: body.imapHost, imapPort: body.imapPort, imapSecure: body.imapSecure,
  });

  if (!settings.smtpHost || !settings.smtpPort) {
    const err = new Error("smtpHost and smtpPort are required for this provider.");
    err.status = 400;
    throw err;
  }

  // Prove the credentials work before storing them.
  if (!skipVerify && password) {
    const check = await verifySmtp({ ...settings, email, password });
    if (!check.ok) {
      const err = new Error(`Could not connect to the mail server: ${check.error}`);
      err.status = 400;
      throw err;
    }
  }

  const duplicate = await EmailAccount.findOne({
    where: { companyId: req.companyId, userId: req.user.id, email },
  });
  if (duplicate) {
    const err = new Error("That mailbox is already connected.");
    err.status = 409;
    throw err;
  }

  const existingCount = await EmailAccount.count({
    where: { companyId: req.companyId, userId: req.user.id },
  });

  return await sequelize.transaction(async (transaction) => {
    const account = await EmailAccount.create(
      {
        companyId: req.companyId,
        createdBy: req.user.id,
        updatedBy: req.user.id,
        userId: req.user.id,
        provider,
        authType: body.authType || "password",
        email,
        displayName: displayName || email,
        encPassword: password ? encrypt(password) : null,
        ...settings,
        status: "active",
        isDefault: existingCount === 0, // first mailbox becomes the default
      },
      { transaction }
    );
    if (account.isDefault) {
      await clearOtherDefaults(req.companyId, req.user.id, account.id, transaction);
    }
    return sanitizeAccount(account);
  });
};

export const updateAccount = async (req, id, body) => {
  const account = await getAccount(req, id);
  if (!account) {
    const err = new Error("Email account not found");
    err.status = 404;
    throw err;
  }

  // Explicit allow-list — never spread req.body into update().
  const patch = { updatedBy: req.user.id };
  for (const field of WRITABLE_FIELDS) {
    if (body[field] !== undefined) patch[field] = body[field];
  }
  if (body.password) patch.encPassword = encrypt(body.password);

  await account.update(patch);
  return sanitizeAccount(account);
};

export const deleteAccount = async (req, id) => {
  const account = await getAccount(req, id);
  if (!account) {
    const err = new Error("Email account not found");
    err.status = 404;
    throw err;
  }
  await account.destroy(); // paranoid => soft delete
  return { message: "Mailbox disconnected" };
};

export const setDefaultAccount = async (req, id) => {
  const account = await getAccount(req, id);
  if (!account) {
    const err = new Error("Email account not found");
    err.status = 404;
    throw err;
  }
  await sequelize.transaction(async (transaction) => {
    await clearOtherDefaults(account.companyId, account.userId, account.id, transaction);
  });
  await account.reload();
  return sanitizeAccount(account);
};

export const testAccount = async (req, id) => {
  const account = await getAccount(req, id);
  if (!account) {
    const err = new Error("Email account not found");
    err.status = 404;
    throw err;
  }
  const password = decrypt(account.encPassword);
  const result = await verifySmtp({
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpSecure: account.smtpSecure,
    email: account.email,
    password,
  });
  await account.update({
    status: result.ok ? "active" : "error",
    lastError: result.ok ? null : result.error,
    updatedBy: req.user.id,
  });
  return result;
};
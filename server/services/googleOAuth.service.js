// ─────────────────────────────────────────────────────────────
// GOOGLE OAUTH 2.0 SERVICE  (Gmail connect + send)
//
// Replaces the old "email + app password" flow with the same OAuth
// handshake HubSpot / Salesforce / Zoho CRM use:
//
//   1. buildConsentUrl()      -> the Google consent-screen URL. Carries a
//                                signed `state` so the PUBLIC callback can
//                                trust which logged-in user is connecting.
//   2. exchangeCode()         -> swap the ?code from Google for tokens.
//   3. fetchProfile()         -> read the Gmail address, name and googleId.
//   4. saveConnectedAccount() -> store the refresh token AES-256-GCM
//                                encrypted (utils/crypto.js). We NEVER store
//                                a password and NEVER send tokens to the
//                                browser.
//
// Sending later reuses the stored refresh token: nodemailer's XOAUTH2
// support mints fresh access tokens on demand, so a user is never asked to
// reconnect just because an access token expired (see buildTransporter in
// emailAccount.service.js).
// ─────────────────────────────────────────────────────────────
import { google } from "googleapis";
import jwt from "jsonwebtoken";
import { EmailAccount } from "../models/index.js";
import { encrypt } from "../utils/crypto.js";
import { sequelize } from "../config/db.js";

// Identity (openid / email / profile) + permission to send mail.
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
];

// The `state` param is signed so the (public) callback can prove this
// server started the flow and recover who is connecting. We reuse
// JWT_SECRET unless a dedicated OAUTH_STATE_SECRET is provided.
const STATE_SECRET = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET;
const STATE_TTL = "10m";

/** Are the Google OAuth env vars present? Lets routes fail with a clear message. */
export const isGoogleConfigured = () =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );

/** A fresh OAuth2 client bound to our app credentials. */
export const createOAuthClient = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

/** Sign { userId, companyId } into the short-lived `state` token. */
export const signState = (payload) =>
  jwt.sign(payload, STATE_SECRET, { expiresIn: STATE_TTL });

/** Verify + decode the `state` token coming back on the callback. */
export const verifyState = (state) => jwt.verify(state, STATE_SECRET);

/**
 * Build the Google consent URL.
 *
 * access_type:"offline" + prompt:"consent" guarantees Google returns a
 * refresh_token. (Without prompt, Google only returns a refresh_token on
 * the user's VERY FIRST consent, which is a classic "why did sending stop
 * working" bug.)
 */
export const buildConsentUrl = ({ userId, companyId }) => {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state: signState({ userId, companyId }),
  });
};

/** Exchange the authorization code for { access_token, refresh_token, expiry_date, ... }. */
export const exchangeCode = async (code) => {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
};

/** Read the connected Gmail address, display name and stable googleId. */
export const fetchProfile = async (tokens) => {
  const client = createOAuthClient();
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  return {
    googleId: data.id,
    email: data.email,
    displayName: data.name || data.email,
  };
};

/** Keep only one default sending mailbox per user per company. */
const clearOtherDefaults = async (companyId, userId, keepId, transaction) => {
  await EmailAccount.update(
    { isDefault: false },
    { where: { companyId, userId }, transaction }
  );
  if (keepId) {
    await EmailAccount.update(
      { isDefault: true },
      { where: { id: keepId }, transaction }
    );
  }
};

/**
 * Create or update the EmailAccount for this Google login.
 *
 * - The refresh token is encrypted at rest and reused indefinitely.
 * - Google only returns a refresh_token on the first consent, so if a
 *   re-connect omits it we KEEP the one already stored (never overwrite a
 *   working token with null).
 */
export const saveConnectedAccount = async ({ userId, companyId, profile, tokens }) => {
  const encRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
  const encAccessToken = tokens.access_token ? encrypt(tokens.access_token) : null;
  const tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  return sequelize.transaction(async (transaction) => {
    // One Gmail per user per company: match on the owner + address.
    let account = await EmailAccount.findOne({
      where: { companyId, userId, email: profile.email },
      transaction,
    });

    if (account) {
      await account.update(
        {
          provider: "gmail",
          authType: "oauth2",
          googleId: profile.googleId,
          displayName: profile.displayName,
          encAccessToken,
          ...(encRefreshToken ? { encRefreshToken } : {}), // keep old token if none returned
          tokenExpiresAt,
          encPassword: null, // drop any legacy app-password
          status: "active",
          lastError: null,
          updatedBy: userId,
        },
        { transaction }
      );
    } else {
      const existingCount = await EmailAccount.count({
        where: { companyId, userId },
        transaction,
      });
      account = await EmailAccount.create(
        {
          companyId,
          userId,
          createdBy: userId,
          updatedBy: userId,
          provider: "gmail",
          authType: "oauth2",
          googleId: profile.googleId,
          email: profile.email,
          displayName: profile.displayName,
          encAccessToken,
          encRefreshToken,
          tokenExpiresAt,
          status: "active",
          isDefault: existingCount === 0, // first mailbox becomes default
        },
        { transaction }
      );
    }

    if (account.isDefault) {
      await clearOtherDefaults(companyId, userId, account.id, transaction);
    }
    return account;
  });
};

/**
 * Connection status for GET /api/email/account.
 * Shapes exactly what the Settings page needs — and NEVER any tokens.
 */
export const getConnectionStatus = async ({ userId, companyId }) => {
  const where = { userId, provider: "gmail", authType: "oauth2" };
  if (companyId) where.companyId = companyId;

  const account = await EmailAccount.findOne({
    where,
    order: [["updatedAt", "DESC"]],
  });

  if (!account) return { connected: false };

  return {
    connected: account.status === "active",
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    provider: account.provider,
    connectedVia: "google",
    status: account.status,
    isDefault: account.isDefault,
    updatedAt: account.updatedAt,
  };
};

/** Disconnect (soft-delete) the user's Gmail OAuth mailbox for POST /api/email/disconnect. */
export const disconnectGoogleAccount = async ({ userId, companyId }) => {
  const where = { userId, provider: "gmail", authType: "oauth2" };
  if (companyId) where.companyId = companyId;

  const account = await EmailAccount.findOne({ where });
  if (!account) {
    const err = new Error("No Google account is connected.");
    err.status = 404;
    throw err;
  }
  await account.destroy(); // paranoid model => soft delete; synced mail is kept
  return { message: "Google account disconnected." };
};
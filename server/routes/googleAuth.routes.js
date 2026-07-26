// ─────────────────────────────────────────────────────────────
// GOOGLE OAUTH ROUTES   (mounted at /api/email)
//
// Mounted in server.js BEFORE the protected email router. Auth is applied
// PER-ROUTE here (not at the mount) on purpose: the Google callback is a
// browser redirect coming FROM Google, so it carries no Authorization
// header. It authenticates itself through the signed `state` instead —
// every other route still requires a valid JWT via `protect`.
//
//   GET  /api/email/google           -> consent URL (frontend redirects to it)
//   GET  /api/email/google/callback  -> exchange code, store account, bounce back
//   GET  /api/email/account          -> current Gmail connection status
//   POST /api/email/disconnect       -> remove the connected Gmail mailbox
// ─────────────────────────────────────────────────────────────
import express from "express";
import { protect } from "../middleware/auth.js";
import { resolveCompany } from "../middleware/tenant.js";
import { logEvent } from "../utils/audit.js";
import {
  isGoogleConfigured,
  buildConsentUrl,
  verifyState,
  exchangeCode,
  fetchProfile,
  saveConnectedAccount,
  getConnectionStatus,
  disconnectGoogleAccount,
} from "../services/googleOAuth.service.js";

const router = express.Router();

// Where to send the browser back to after the OAuth round-trip.
const frontendUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const settingsRedirect = (params) => `${frontendUrl()}/email/settings?${params}`;

// ── GET /api/email/google ────────────────────────────────────
// Returns the Google consent URL. The SPA cannot 302-redirect through a
// protected endpoint (a browser redirect would not send the JWT header),
// so instead it fetches this URL over axios and then sets window.location.
router.get("/google", protect, resolveCompany, (req, res, next) => {
  try {
    if (!isGoogleConfigured()) {
      return res
        .status(503)
        .json({ message: "Google sign-in is not configured on the server." });
    }
    // companyId is NOT NULL on email_accounts — a super_admin browsing
    // "all companies" must pick one first.
    if (!req.companyId) {
      return res
        .status(400)
        .json({ message: "Select a company before connecting Gmail." });
    }
    const url = buildConsentUrl({ userId: req.user.id, companyId: req.companyId });
    return res.json({ url });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/email/google/callback ───────────────────────────
// PUBLIC. Google redirects the browser here with ?code & ?state. We verify
// the signed state, exchange the code, store the account, then bounce the
// browser back to the Email Settings page with a success/error flag.
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  try {
    if (error) {
      return res.redirect(settingsRedirect(`error=${encodeURIComponent(error)}`));
    }
    if (!code || !state) {
      return res.redirect(settingsRedirect("error=missing_code"));
    }

    // Recover the user who started the flow (and prove we started it).
    let claims;
    try {
      claims = verifyState(state); // { userId, companyId }
    } catch {
      return res.redirect(settingsRedirect("error=invalid_state"));
    }

    const tokens = await exchangeCode(code);
    if (!tokens.access_token && !tokens.refresh_token) {
      return res.redirect(settingsRedirect("error=token_exchange_failed"));
    }

    const profile = await fetchProfile(tokens);

    const account = await saveConnectedAccount({
      userId: claims.userId,
      companyId: claims.companyId,
      profile,
      tokens,
    });

    // Audit, but never let a logging hiccup break the connection.
    await logEvent({
      companyId: claims.companyId,
      userId: claims.userId,
      action: "email_account_connected",
      resourceId: account.id,
      changes: { email: profile.email, provider: "gmail", via: "google_oauth" },
    }).catch(() => {});

    return res.redirect(
      settingsRedirect(`connected=1&email=${encodeURIComponent(profile.email)}`)
    );
  } catch (err) {
    // Full detail stays on the server; the user just gets a friendly flag.
    console.error("GOOGLE OAUTH CALLBACK ERROR:", err?.message || err);
    return res.redirect(settingsRedirect("error=connection_failed"));
  }
});

// ── GET /api/email/account ───────────────────────────────────
// Current Gmail connection status for the Settings page. No tokens.
router.get("/account", protect, resolveCompany, async (req, res, next) => {
  try {
    const status = await getConnectionStatus({
      userId: req.user.id,
      companyId: req.companyId,
    });
    return res.json(status);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/email/disconnect ───────────────────────────────
// Remove the connected Gmail mailbox for the logged-in user.
router.post("/disconnect", protect, resolveCompany, async (req, res, next) => {
  try {
    const result = await disconnectGoogleAccount({
      userId: req.user.id,
      companyId: req.companyId,
    });
    await logEvent({
      companyId: req.companyId,
      userId: req.user.id,
      action: "email_account_disconnected",
      changes: { via: "google_oauth" },
    }).catch(() => {});
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
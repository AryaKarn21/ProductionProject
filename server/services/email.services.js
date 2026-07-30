import transporter from "../config/mail.js";

// NOTE: the actual file on disk is `Emailmodels.js` (lowercase "m"). The
// previous import here used `EmailModels.js` (capital "M"), which only
// resolved on case-insensitive filesystems (Windows/macOS default). On any
// case-sensitive filesystem (Linux, most CI/production containers) this
// import fails at module-load time — which takes the whole server down,
// since auth.routes.js and employees.routes.js both import sendEmail from
// this file. `models/index.js` has the exact same typo and should be fixed
// the same way if you're deploying to Linux.
import {
  EmailAccount,
  EmailThread,
  EmailAttachment,
} from "../models/Emailmodels.js";

/*
|--------------------------------------------------------------------------
| Transactional mail sender
|--------------------------------------------------------------------------
| This was the missing piece: every call site (auth.routes.js — OTP/
| password reset, employees.routes.js — employee messages,
| emailNotification.service.js — welcome/meeting-reminder emails) already
| imports `sendEmail` from this file with the shape
| `sendEmail({ to, subject, html })`, but no such export existed — only the
| unused `baseQuery` helper below. That's a named-export ESM error at
| import time, which crashes the server before it can even start.
*/

export async function sendEmail({ to, subject, html, text, cc, bcc, attachments }) {
  if (!to) throw new Error("sendEmail: 'to' is required");
  if (!subject) throw new Error("sendEmail: 'subject' is required");
  if (!html && !text) throw new Error("sendEmail: 'html' or 'text' is required");

  const from = process.env.MAIL_FROM || process.env.MAIL_USER;

  return transporter.sendMail({
    from,
    to,
    cc,
    bcc,
    subject,
    html,
    text,
    attachments,
  });
}

/*
|--------------------------------------------------------------------------
| Shared Query Builder
|--------------------------------------------------------------------------
| Not called anywhere yet (reserved for the mailbox-listing feature under
| the Email module) — left in place as-is, just with the import fixed above
| so it no longer breaks module loading.
*/

// Prefixed with an underscore to mark it as intentionally unused. The
// comment above records a deliberate decision to keep it, so deleting
// it to satisfy the linter would throw away that intent; the prefix
// says "unused on purpose" in a way the tooling understands.
const _baseQuery = (companyId) => ({
  where: {
    companyId,
  },

  include: [
    {
      model: EmailAccount,
      as: "account",
      attributes: ["id", "email", "displayName", "provider", "status"],
    },
    {
      model: EmailThread,
      as: "thread",
      required: false,
      attributes: ["id", "subject", "messageCount"],
    },
    {
      model: EmailAttachment,
      as: "attachments",
      required: false,
      attributes: ["id", "originalName", "mimeType", "sizeBytes"],
    },
  ],
});
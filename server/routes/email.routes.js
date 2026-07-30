import express from "express";

import { logEvent } from "../utils/audit.js";

import {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount,
  testAccount,
  sanitizeAccount,
  accountScope,
  buildTransporter,
} from "../services/emailAccount.service.js";

import {
  Email,
  EmailAccount,
  EmailThread,
  EmailAttachment,
} from "../models/Emailmodels.js";

import {
  syncAccessibleAccount,
  syncUserMailboxes,
} from "../services/emailSync.service.js";

import uploadEmailAttachment from "../middleware/emailUpload.js";

const router = express.Router();

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
};

const parsePagination = (query) => {
  const parsedPage = Number.parseInt(query.page, 10);
  const parsedLimit = Number.parseInt(query.limit, 10);

  const page =
    Number.isInteger(parsedPage) && parsedPage > 0
      ? parsedPage
      : 1;

  const limit = Math.min(
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : 50,
    100
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

const buildAccountWhere = (req) => {
  const where = {
    ...accountScope(req),
  };

  if (req.query.accountId) {
    where.id = req.query.accountId;
  }

  return where;
};

const buildEmailWhere = (req, folder) => {
  const where = {
    folder,
  };

  if (req.companyId) {
    where.companyId = req.companyId;
  }

  return where;
};

const accountInclude = (req) => ({
  model: EmailAccount,
  as: "account",
  required: true,
  where: buildAccountWhere(req),
  attributes: [
    "id",
    "displayName",
    "email",
    "provider",
    "status",
  ],
});

const listMailbox = async (req, res, folder) => {
  const {
    page,
    limit,
    offset,
  } = parsePagination(req.query);

  const {
    rows: emails,
    count: total,
  } = await Email.findAndCountAll({
    where: buildEmailWhere(req, folder),

    include: [
      accountInclude(req),
    ],

    order: [
      ["createdAt", "DESC"],
    ],

    limit,
    offset,
    distinct: true,
  });

  const totalPages =
    total === 0
      ? 0
      : Math.ceil(total / limit);

  return res.json({
    success: true,

    emails,

    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage:
        page < totalPages,
      hasPreviousPage:
        page > 1,
    },
  });
};

const getAccessibleEmail = async (
  req,
  emailId
) => {
  return Email.findOne({
    where: {
      id: emailId,

      ...(req.companyId
        ? {
            companyId:
              req.companyId,
          }
        : {}),
    },

    include: [
      {
        ...accountInclude(req),
      },
    ],
  });
};

// ============================================================
// COMPOSE HELPERS
// ============================================================

/** Accepts "a@x.com, b@y.com" or ["a@x.com","b@y.com"] (multipart fields
 *  arrive as strings, JSON bodies may already send arrays). */
const parseAddressList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
};

const stripHtml = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const snippetFrom = (text, html) => {
  const source = text || stripHtml(html);
  return source ? source.slice(0, 160) : "";
};

/** Picks which connected mailbox a message should be sent from: the
 *  explicit accountId if the caller has access to it, else their default
 *  mailbox, else their first active one. Throws a 400 if none exist. */
const resolveSendingAccount = async (req, accountId) => {
  const scope = accountScope(req);

  if (accountId) {
    const account = await EmailAccount.findOne({
      where: { ...scope, id: accountId, status: "active" },
    });
    if (!account) {
      const error = new Error(
        "That email account was not found, isn't yours, or isn't active."
      );
      error.status = 400;
      throw error;
    }
    return account;
  }

  const defaultAccount = await EmailAccount.findOne({
    where: { ...scope, status: "active", isDefault: true },
  });
  if (defaultAccount) return defaultAccount;

  const anyAccount = await EmailAccount.findOne({
    where: { ...scope, status: "active" },
    order: [["createdAt", "ASC"]],
  });
  if (anyAccount) return anyAccount;

  const error = new Error(
    "No connected email account is available to send from. Connect a mailbox first."
  );
  error.status = 400;
  throw error;
};

/** Persists uploaded files (from uploadEmailAttachment) as EmailAttachment
 *  rows tied to the given email, and returns them ready for nodemailer. */
const buildAttachmentRecords = async (files, emailId, req) => {
  if (!files || !files.length) return [];

  return Promise.all(
    files.map((file) =>
      EmailAttachment.create({
        companyId: req.companyId,
        createdBy: req.user.id,
        emailId,
        fileName: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: file.path,
      })
    )
  );
};

const toNodemailerAttachments = (attachmentRecords) =>
  attachmentRecords.map((a) => ({
    filename: a.originalName,
    path: a.storagePath,
  }));

// ============================================================
// EMAIL ACCOUNTS
// ============================================================

router.get(
  "/accounts",

  handle(async (req, res) => {
    const accounts =
      await listAccounts(req);

    return res.json({
      success: true,
      accounts,
      total: accounts.length,
    });
  })
);

router.post(
  "/accounts",

  handle(async (req, res) => {
    const account =
      await createAccount(
        req,
        req.body
      );

    await logEvent({
      companyId:
        req.companyId,

      userId:
        req.user.id,

      action:
        "email_account_connected",

      resourceId:
        account.id,

      changes: {
        provider:
          account.provider,

        email:
          account.email,
      },
    });

    return res
      .status(201)
      .json({
        success: true,
        account,
      });
  })
);

router.get(
  "/accounts/:id",

  handle(async (req, res) => {
    const account =
      await getAccount(
        req,
        req.params.id
      );

    if (!account) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Email account not found",
        });
    }

    return res.json({
      success: true,

      account:
        sanitizeAccount(
          account
        ),
    });
  })
);

router.patch(
  "/accounts/:id",

  handle(async (req, res) => {
    const account =
      await updateAccount(
        req,
        req.params.id,
        req.body
      );

    await logEvent({
      companyId:
        req.companyId,

      userId:
        req.user.id,

      action:
        "email_account_updated",

      resourceId:
        req.params.id,

      changes: {},
    });

    return res.json({
      success: true,
      account,
    });
  })
);

router.delete(
  "/accounts/:id",

  handle(async (req, res) => {
    const result =
      await deleteAccount(
        req,
        req.params.id
      );

    await logEvent({
      companyId:
        req.companyId,

      userId:
        req.user.id,

      action:
        "email_account_disconnected",

      resourceId:
        req.params.id,

      changes: {},
    });

    return res.json({
      success: true,
      ...result,
    });
  })
);

router.patch(
  "/accounts/:id/set-default",

  handle(async (req, res) => {
    const account =
      await setDefaultAccount(
        req,
        req.params.id
      );

    await logEvent({
      companyId:
        req.companyId,

      userId:
        req.user.id,

      action:
        "email_default_account_changed",

      resourceId:
        req.params.id,

      changes: {},
    });

    return res.json({
      success: true,
      account,
    });
  })
);

router.post(
  "/accounts/:id/test",

  handle(async (req, res) => {
    const result =
      await testAccount(
        req,
        req.params.id
      );

    if (!result.ok) {
      return res
        .status(400)
        .json({
          success: false,
          ok: false,

          message:
            result.error ||
            "Email account connection failed",
        });
    }

    return res.json({
      success: true,
      ok: true,

      message:
        "Connection successful",
    });
  })
);

// ============================================================
// SYNCHRONIZATION
// ============================================================

router.post(
  "/accounts/:id/sync",

  handle(async (req, res) => {
    const result =
      await syncAccessibleAccount(
        req,
        req.params.id,
        {
          limit:
            req.body?.limit,
        }
      );

    return res.json({
      success: true,

      message:
        "Mailbox synchronization completed.",

      result,
    });
  })
);

router.post(
  "/sync",

  handle(async (req, res) => {
    const results =
      await syncUserMailboxes(
        req,
        {
          limit:
            req.body?.limit,
        }
      );

    const successful =
      results.filter(
        (item) =>
          item.success
      ).length;

    const failed =
      results.length -
      successful;

    return res.json({
      success:
        failed === 0,

      message:
        failed === 0
          ? "Mailbox synchronization completed."
          : "Mailbox synchronization completed with errors.",

      summary: {
        totalAccounts:
          results.length,

        successful,
        failed,
      },

      results,
    });
  })
);

// ============================================================
// COMPOSE — send, save draft, reply, forward
// ============================================================
// These four routes were the actual gap: Compose.jsx and ComposeModal.jsx
// already call emailAPI.sendEmail() / saveDraft() / replyEmail() /
// forwardEmail(), and those already point at these exact paths — but none
// of them existed here, so every send attempt was a 404. This wires them
// up using the per-account SMTP transporter that emailAccount.service.js
// already builds (buildTransporter), so mail goes out from whichever
// mailbox the user has connected/selected rather than a shared system
// address.

router.post(
  "/send",
  uploadEmailAttachment.array("attachments", 10),

  handle(async (req, res) => {
    const { accountId, to, cc, bcc, subject, bodyHtml, bodyText, relatedType, relatedId } =
      req.body;

    const account = await resolveSendingAccount(req, accountId);

    const toList = parseAddressList(to);
    if (!toList.length) {
      const error = new Error('At least one recipient ("to") is required.');
      error.status = 400;
      throw error;
    }
    if (!subject || !String(subject).trim()) {
      const error = new Error("Subject is required.");
      error.status = 400;
      throw error;
    }

    const ccList = parseAddressList(cc);
    const bccList = parseAddressList(bcc);

    const email = await Email.create({
      companyId: req.companyId,
      createdBy: req.user.id,
      updatedBy: req.user.id,
      accountId: account.id,
      folder: "outbox",
      status: "sending",
      subject,
      bodyHtml: bodyHtml || null,
      bodyText: bodyText || (bodyHtml ? stripHtml(bodyHtml) : null),
      snippet: snippetFrom(bodyText, bodyHtml),
      fromName: account.displayName,
      fromAddress: account.email,
      toAddresses: toList,
      ccAddresses: ccList,
      bccAddresses: bccList,
      hasAttachments: Boolean(req.files?.length),
      relatedType: relatedType || null,
      relatedId: relatedId || null,
    });

    const attachmentRecords = await buildAttachmentRecords(req.files, email.id, req);

    try {
      const transporter = buildTransporter(account);
      const info = await transporter.sendMail({
        from: account.displayName ? `"${account.displayName}" <${account.email}>` : account.email,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        subject,
        html: bodyHtml || undefined,
        text: bodyText || undefined,
        attachments: toNodemailerAttachments(attachmentRecords),
      });

      await email.update({
        folder: "sent",
        status: "sent",
        messageId: info.messageId,
        sentAt: new Date(),
      });

      await logEvent({
        companyId: req.companyId,
        userId: req.user.id,
        action: "email_sent",
        resourceId: email.id,
        changes: { to: toList, subject },
      });

      return res.status(201).json({
        success: true,
        email: await getAccessibleEmail(req, email.id),
      });
    } catch (err) {
      await email.update({ folder: "outbox", status: "failed", errorMessage: err.message });
      const error = new Error(`Failed to send email: ${err.message}`);
      error.status = 502;
      throw error;
    }
  })
);

router.post(
  "/draft",
  uploadEmailAttachment.array("attachments", 10),

  handle(async (req, res) => {
    const { id, accountId, to, cc, bcc, subject, bodyHtml, bodyText, relatedType, relatedId } =
      req.body;

    let email = null;
    let isNew = false;

    if (id) {
      email = await getAccessibleEmail(req, id);
      if (!email || email.folder !== "drafts") {
        const error = new Error("Draft not found");
        error.status = 404;
        throw error;
      }
    }

    const account = await resolveSendingAccount(req, accountId || email?.accountId);
    const toList = parseAddressList(to);
    const ccList = parseAddressList(cc);
    const bccList = parseAddressList(bcc);

    const payload = {
      updatedBy: req.user.id,
      accountId: account.id,
      subject: subject ?? email?.subject ?? "",
      bodyHtml: bodyHtml ?? email?.bodyHtml ?? null,
      bodyText: bodyText ?? email?.bodyText ?? null,
      snippet: snippetFrom(bodyText, bodyHtml),
      fromName: account.displayName,
      fromAddress: account.email,
      toAddresses: toList,
      ccAddresses: ccList,
      bccAddresses: bccList,
      folder: "drafts",
      status: "draft",
      relatedType: relatedType ?? email?.relatedType ?? null,
      relatedId: relatedId ?? email?.relatedId ?? null,
    };

    if (email) {
      await email.update(payload);
    } else {
      isNew = true;
      email = await Email.create({
        companyId: req.companyId,
        createdBy: req.user.id,
        ...payload,
      });
    }

    const attachmentRecords = await buildAttachmentRecords(req.files, email.id, req);
    if (attachmentRecords.length) await email.update({ hasAttachments: true });

    return res.status(isNew ? 201 : 200).json({
      success: true,
      email: await getAccessibleEmail(req, email.id),
    });
  })
);

router.post(
  "/:id/reply",
  uploadEmailAttachment.array("attachments", 10),

  handle(async (req, res) => {
    const original = await getAccessibleEmail(req, req.params.id);
    if (!original) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    const { accountId, to, cc, bcc, bodyHtml, bodyText, replyAll } = req.body;
    const account = await resolveSendingAccount(req, accountId || original.accountId);

    const explicitTo = parseAddressList(to);
    const toList = explicitTo.length ? explicitTo : [original.fromAddress].filter(Boolean);

    let ccList = parseAddressList(cc);
    if (replyAll === "true" || replyAll === true) {
      const others = [...(original.toAddresses || []), ...(original.ccAddresses || [])].filter(
        (address) => address && address !== account.email
      );
      ccList = Array.from(new Set([...ccList, ...others]));
    }
    const bccList = parseAddressList(bcc);

    const subject =
      original.subject && /^re:/i.test(original.subject.trim())
        ? original.subject
        : `Re: ${original.subject || ""}`;

    // Keep this message on the same thread as the original, creating one
    // retroactively if the original message never had one.
    let threadId = original.threadId;
    if (!threadId) {
      const thread = await EmailThread.create({
        companyId: req.companyId,
        createdBy: req.user.id,
        accountId: account.id,
        subject: original.subject,
        participants: [original.fromAddress, ...(original.toAddresses || [])].filter(Boolean),
        messageCount: 1,
        lastMessageAt: original.createdAt,
        snippet: original.snippet,
        folder: "inbox",
        isRead: original.isRead,
      });
      threadId = thread.id;
      await original.update({ threadId });
    }

    const email = await Email.create({
      companyId: req.companyId,
      createdBy: req.user.id,
      updatedBy: req.user.id,
      accountId: account.id,
      threadId,
      inReplyTo: original.messageId,
      folder: "outbox",
      status: "sending",
      subject,
      bodyHtml: bodyHtml || null,
      bodyText: bodyText || (bodyHtml ? stripHtml(bodyHtml) : null),
      snippet: snippetFrom(bodyText, bodyHtml),
      fromName: account.displayName,
      fromAddress: account.email,
      toAddresses: toList,
      ccAddresses: ccList,
      bccAddresses: bccList,
      relatedType: original.relatedType,
      relatedId: original.relatedId,
    });

    const attachmentRecords = await buildAttachmentRecords(req.files, email.id, req);

    try {
      const transporter = buildTransporter(account);
      const info = await transporter.sendMail({
        from: account.displayName ? `"${account.displayName}" <${account.email}>` : account.email,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        subject,
        html: bodyHtml || undefined,
        text: bodyText || undefined,
        inReplyTo: original.messageId || undefined,
        references: original.messageId || undefined,
        attachments: toNodemailerAttachments(attachmentRecords),
      });

      await email.update({
        folder: "sent",
        status: "sent",
        messageId: info.messageId,
        sentAt: new Date(),
      });

      const thread = await EmailThread.findByPk(threadId);
      if (thread) {
        await thread.update({
          messageCount: (thread.messageCount || 0) + 1,
          lastMessageAt: new Date(),
          snippet: snippetFrom(bodyText, bodyHtml),
        });
      }

      await logEvent({
        companyId: req.companyId,
        userId: req.user.id,
        action: "email_replied",
        resourceId: email.id,
        changes: { to: toList, inReplyTo: original.id },
      });

      return res.status(201).json({
        success: true,
        email: await getAccessibleEmail(req, email.id),
      });
    } catch (err) {
      await email.update({ folder: "outbox", status: "failed", errorMessage: err.message });
      const error = new Error(`Failed to send reply: ${err.message}`);
      error.status = 502;
      throw error;
    }
  })
);

router.post(
  "/:id/forward",
  uploadEmailAttachment.array("attachments", 10),

  handle(async (req, res) => {
    const original = await getAccessibleEmail(req, req.params.id);
    if (!original) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    const { accountId, to, cc, bcc, bodyHtml, bodyText } = req.body;
    const account = await resolveSendingAccount(req, accountId || original.accountId);

    const toList = parseAddressList(to);
    if (!toList.length) {
      const error = new Error('At least one recipient ("to") is required to forward this email.');
      error.status = 400;
      throw error;
    }
    const ccList = parseAddressList(cc);
    const bccList = parseAddressList(bcc);

    const subject =
      original.subject && /^fwd:/i.test(original.subject.trim())
        ? original.subject
        : `Fwd: ${original.subject || ""}`;

    const forwardHeaderHtml = `<br>---------- Forwarded message ----------<br>From: ${
      original.fromName || original.fromAddress || ""
    }<br>Subject: ${original.subject || ""}<br><br>`;
    const forwardHeaderText = `\n\n---------- Forwarded message ----------\nFrom: ${
      original.fromName || original.fromAddress || ""
    }\nSubject: ${original.subject || ""}\n\n`;

    const finalBodyHtml = `${bodyHtml || ""}${forwardHeaderHtml}${
      original.bodyHtml || `<p>${stripHtml(original.bodyText)}</p>`
    }`;
    const finalBodyText = `${bodyText || ""}${forwardHeaderText}${
      original.bodyText || stripHtml(original.bodyHtml)
    }`;

    const email = await Email.create({
      companyId: req.companyId,
      createdBy: req.user.id,
      updatedBy: req.user.id,
      accountId: account.id,
      threadId: null,
      inReplyTo: original.messageId,
      folder: "outbox",
      status: "sending",
      subject,
      bodyHtml: finalBodyHtml,
      bodyText: finalBodyText,
      snippet: snippetFrom(finalBodyText, finalBodyHtml),
      fromName: account.displayName,
      fromAddress: account.email,
      toAddresses: toList,
      ccAddresses: ccList,
      bccAddresses: bccList,
      relatedType: original.relatedType,
      relatedId: original.relatedId,
    });

    const attachmentRecords = await buildAttachmentRecords(req.files, email.id, req);

    try {
      const transporter = buildTransporter(account);
      const info = await transporter.sendMail({
        from: account.displayName ? `"${account.displayName}" <${account.email}>` : account.email,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        subject,
        html: finalBodyHtml,
        text: finalBodyText,
        attachments: toNodemailerAttachments(attachmentRecords),
      });

      await email.update({
        folder: "sent",
        status: "sent",
        messageId: info.messageId,
        sentAt: new Date(),
      });

      await logEvent({
        companyId: req.companyId,
        userId: req.user.id,
        action: "email_forwarded",
        resourceId: email.id,
        changes: { to: toList, forwardedFrom: original.id },
      });

      return res.status(201).json({
        success: true,
        email: await getAccessibleEmail(req, email.id),
      });
    } catch (err) {
      await email.update({ folder: "outbox", status: "failed", errorMessage: err.message });
      const error = new Error(`Failed to forward email: ${err.message}`);
      error.status = 502;
      throw error;
    }
  })
);

// ============================================================
// MAILBOX LIST ROUTES
// ============================================================

router.get(
  "/inbox",

  handle(async (req, res) =>
    listMailbox(
      req,
      res,
      "inbox"
    )
  )
);

router.get(
  "/sent",

  handle(async (req, res) =>
    listMailbox(
      req,
      res,
      "sent"
    )
  )
);

router.get(
  "/drafts",

  handle(async (req, res) =>
    listMailbox(
      req,
      res,
      // NOTE: the Email model's `folder` column is a strict ENUM whose
      // member is "drafts" (plural) — this previously read "draft"
      // (singular), which isn't a valid enum value. That silently made
      // this route match zero rows forever, no matter how many drafts
      // actually existed in the database.
      "drafts"
    )
  )
);

router.get(
  "/trash",

  handle(async (req, res) =>
    listMailbox(
      req,
      res,
      "trash"
    )
  )
);

router.get(
  "/spam",

  handle(async (req, res) =>
    listMailbox(
      req,
      res,
      "spam"
    )
  )
);

router.get(
  "/archive",

  handle(async (req, res) =>
    listMailbox(
      req,
      res,
      "archive"
    )
  )
);

// ============================================================
// STARRED
// ============================================================

router.get(
  "/starred",

  handle(async (req, res) => {
    const {
      page,
      limit,
      offset,
    } = parsePagination(
      req.query
    );

    const where = {
      starred: true,

      ...(req.companyId
        ? {
            companyId:
              req.companyId,
          }
        : {}),
    };

    const {
      rows: emails,
      count: total,
    } =
      await Email.findAndCountAll(
        {
          where,

          include: [
            accountInclude(req),
          ],

          order: [
            [
              "createdAt",
              "DESC",
            ],
          ],

          limit,
          offset,
          distinct: true,
        }
      );

    const totalPages =
      total === 0
        ? 0
        : Math.ceil(
            total / limit
          );

    return res.json({
      success: true,

      emails,

      pagination: {
        page,
        limit,
        total,
        totalPages,

        hasNextPage:
          page < totalPages,

        hasPreviousPage:
          page > 1,
      },
    });
  })
);

// ============================================================
// SINGLE EMAIL
// ============================================================

router.get(
  "/:id",

  handle(async (req, res) => {
    const email =
      await getAccessibleEmail(
        req,
        req.params.id
      );

    if (!email) {
      return res
        .status(404)
        .json({
          success: false,

          message:
            "Email not found",
        });
    }

    return res.json({
      success: true,
      email,
    });
  })
);

// ============================================================
// MARK READ
// ============================================================

router.patch(
  "/:id/read",

  handle(async (req, res) => {
    const email =
      await getAccessibleEmail(
        req,
        req.params.id
      );

    if (!email) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Email not found",
        });
    }

    await email.update({
      read: true,
    });

    return res.json({
      success: true,
      email,
    });
  })
);

// ============================================================
// TOGGLE STAR
// ============================================================

router.patch(
  "/:id/star",

  handle(async (req, res) => {
    const email =
      await getAccessibleEmail(
        req,
        req.params.id
      );

    if (!email) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Email not found",
        });
    }

    await email.update({
      starred:
        !email.starred,
    });

    return res.json({
      success: true,
      email,
    });
  })
);

// ============================================================
// DELETE / MOVE TO TRASH
// ============================================================

router.delete(
  "/:id",

  handle(async (req, res) => {
    const email =
      await getAccessibleEmail(
        req,
        req.params.id
      );

    if (!email) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Email not found",
        });
    }

    /*
     * Mail UI normally treats Delete
     * as "move to trash", not an
     * immediate destructive database
     * delete.
     */
    await email.update({
      folder: "trash",
    });

    await logEvent({
      companyId:
        req.companyId,

      userId:
        req.user.id,

      action:
        "email_moved_to_trash",

      resourceId:
        email.id,

      changes: {},
    });

    return res.json({
      success: true,

      message:
        "Email moved to trash.",
    });
  })
);

export default router;
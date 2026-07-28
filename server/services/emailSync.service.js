import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { Op } from "sequelize";

import { sequelize } from "../config/db.js";
import {
  Email,
  EmailAccount,
  EmailThread,
} from "../models/Emailmodels.js";

// IMPORTANT:
// Replace this import ONLY if your existing crypto utility exports
// the decrypt function under a different name.
// Use the SAME decrypt helper already used by emailAccount.service.js.
import { decrypt } from "../utils/crypto.js";

const DEFAULT_SYNC_LIMIT = 50;
const MAX_SYNC_LIMIT = 100;

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_SYNC_LIMIT;
  }

  return Math.min(parsed, MAX_SYNC_LIMIT);
}

function normalizeAddressList(value) {
  if (!value?.value || !Array.isArray(value.value)) {
    return [];
  }

  return value.value
    .map((entry) => ({
      name: entry.name || "",
      address: entry.address || "",
    }))
    .filter((entry) => entry.address);
}

function firstAddress(value) {
  const addresses = normalizeAddressList(value);

  return addresses[0] || {
    name: "",
    address: "",
  };
}

function buildSnippet(text, html) {
  const source =
    text ||
    String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ");

  return source
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250);
}

function normalizeMessageId(messageId, accountId, uid) {
  if (messageId) {
    return String(messageId).trim();
  }

  /*
   * Some messages may not contain Message-ID.
   * Generate a deterministic local identifier from account + IMAP UID
   * so repeated synchronization does not create duplicates.
   */
  return `<imap-${accountId}-${uid}@crm.local>`;
}

function getPriority(parsed) {
  const priority = String(parsed.priority || "").toLowerCase();

  if (priority === "high") return "high";
  if (priority === "low") return "low";

  return "normal";
}

function getImapCredentials(account) {
  if (!account.encPassword) {
    throw new Error(
      "This mailbox does not have an IMAP password configured."
    );
  }

  return {
    user: account.email,
    pass: decrypt(account.encPassword),
  };
}

function createImapClient(account) {
  if (!account.imapHost) {
    throw new Error("IMAP host is not configured.");
  }

  if (!account.imapPort) {
    throw new Error("IMAP port is not configured.");
  }

  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure !== false,

    auth: getImapCredentials(account),

    logger: false,

    socketTimeout: 30_000,

    /*
     * Do not silently accept invalid TLS certificates.
     */
    tls: {
      rejectUnauthorized: true,
    },
  });
}

async function findOrCreateThread({
  transaction,
  account,
  parsed,
  messageId,
  snippet,
  receivedAt,
}) {
  /*
   * First try to find the parent message using In-Reply-To.
   */
  const inReplyTo = parsed.inReplyTo
    ? String(parsed.inReplyTo).trim()
    : null;

  if (inReplyTo) {
    const parent = await Email.findOne({
      where: {
        companyId: account.companyId,
        accountId: account.id,
        messageId: inReplyTo,
      },

      transaction,
    });

    if (parent?.threadId) {
      return EmailThread.findOne({
        where: {
          id: parent.threadId,
          companyId: account.companyId,
          accountId: account.id,
        },

        transaction,
      });
    }
  }

  /*
   * References may point to an older message in the conversation.
   */
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : [];

  if (references.length) {
    const referencedEmail = await Email.findOne({
      where: {
        companyId: account.companyId,
        accountId: account.id,

        messageId: {
          [Op.in]: references.map(String),
        },
      },

      transaction,
    });

    if (referencedEmail?.threadId) {
      return EmailThread.findOne({
        where: {
          id: referencedEmail.threadId,
          companyId: account.companyId,
          accountId: account.id,
        },

        transaction,
      });
    }
  }

  /*
   * No existing conversation was found.
   * Create a new thread.
   */
  // `const from = firstAddress(parsed.from)` was computed here and
  // never read — the participant list below derives the sender
  // itself via normalizeAddressList(parsed.from).

  const participants = [
    ...normalizeAddressList(parsed.from),
    ...normalizeAddressList(parsed.to),
    ...normalizeAddressList(parsed.cc),
  ];

  return EmailThread.create(
    {
      companyId: account.companyId,

      accountId: account.id,

      createdBy: account.userId,
      updatedBy: account.userId,

      subject: parsed.subject || "(No subject)",

      participants,

      messageCount: 0,

      lastMessageAt:
        receivedAt || new Date(),

      snippet,

      folder: "inbox",

      isRead: false,
    },
    {
      transaction,
    }
  );
}

async function saveIncomingMessage({
  account,
  uid,
  flags,
  source,
}) {
  const parsed = await simpleParser(source);

  const messageId = normalizeMessageId(
    parsed.messageId,
    account.id,
    uid
  );

  /*
   * Deduplicate before creating anything.
   */
  const existing = await Email.findOne({
    where: {
      companyId: account.companyId,
      accountId: account.id,
      messageId,
    },
  });

  if (existing) {
    return {
      created: false,
      email: existing,
    };
  }

  const receivedAt =
    parsed.date instanceof Date
      ? parsed.date
      : new Date();

  const snippet = buildSnippet(
    parsed.text,
    parsed.html
  );

  const from = firstAddress(parsed.from);

  const transaction =
    await sequelize.transaction();

  try {
    /*
     * Check again inside the transaction to reduce duplicate creation
     * if two synchronization requests overlap.
     */
    const duplicate = await Email.findOne({
      where: {
        companyId: account.companyId,
        accountId: account.id,
        messageId,
      },

      transaction,
    });

    if (duplicate) {
      await transaction.rollback();

      return {
        created: false,
        email: duplicate,
      };
    }

    const thread = await findOrCreateThread({
      transaction,
      account,
      parsed,
      messageId,
      snippet,
      receivedAt,
    });

    const isRead =
      flags instanceof Set
        ? flags.has("\\Seen")
        : Array.isArray(flags)
          ? flags.includes("\\Seen")
          : false;

    const isStarred =
      flags instanceof Set
        ? flags.has("\\Flagged")
        : Array.isArray(flags)
          ? flags.includes("\\Flagged")
          : false;

    const email = await Email.create(
      {
        companyId: account.companyId,

        accountId: account.id,

        threadId: thread?.id || null,

        createdBy: account.userId,
        updatedBy: account.userId,

        messageId,

        inReplyTo: parsed.inReplyTo
          ? String(parsed.inReplyTo)
          : null,

        folder: "inbox",

        subject:
          parsed.subject ||
          "(No subject)",

        bodyHtml:
          typeof parsed.html === "string"
            ? parsed.html
            : null,

        bodyText:
          parsed.text || null,

        snippet,

        fromName:
          from.name || null,

        fromAddress:
          from.address || null,

        toAddresses:
          normalizeAddressList(parsed.to),

        ccAddresses:
          normalizeAddressList(parsed.cc),

        bccAddresses:
          normalizeAddressList(parsed.bcc),

        replyTo:
          firstAddress(parsed.replyTo).address ||
          null,

        priority: getPriority(parsed),

        isRead,

        isStarred,

        hasAttachments:
          Array.isArray(parsed.attachments) &&
          parsed.attachments.length > 0,

        /*
         * Incoming mail is already delivered to this mailbox.
         * "delivered" is the closest valid status in the current model.
         */
        status: "delivered",

        deliveredAt: receivedAt,

        sizeBytes:
          Buffer.isBuffer(source)
            ? source.length
            : Buffer.byteLength(source),

        labels: [],
      },
      {
        transaction,
      }
    );

    /*
     * Phase 1B intentionally does NOT write attachment binary data yet.
     *
     * Your EmailAttachment model contains storagePath/url/checksum,
     * therefore attachment persistence needs to go through the project's
     * secure private-file storage architecture rather than dumping
     * untrusted files into public /uploads.
     *
     * hasAttachments is still correctly populated.
     */

    if (thread) {
      const nextCount =
        Number(thread.messageCount || 0) + 1;

      await thread.update(
        {
          subject:
            thread.subject ||
            parsed.subject ||
            "(No subject)",

          messageCount: nextCount,

          lastMessageAt: receivedAt,

          snippet,

          folder: "inbox",

          isRead,
        },
        {
          transaction,
        }
      );
    }

    await transaction.commit();

    return {
      created: true,
      email,
    };
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    throw error;
  }
}

export async function syncEmailAccount(
  account,
  options = {}
) {
  if (!account) {
    throw new Error(
      "Email account is required."
    );
  }

  if (account.status === "disconnected") {
    throw new Error(
      "Disconnected mailboxes cannot be synchronized."
    );
  }

  if (!account.syncEnabled) {
    throw new Error(
      "Synchronization is disabled for this mailbox."
    );
  }

  const limit = normalizeLimit(
    options.limit
  );

  const client =
    createImapClient(account);

  let lock;

  let scanned = 0;
  let imported = 0;
  let skipped = 0;
  const errors = [];

  try {
    await client.connect();

    lock = await client.getMailboxLock(
      "INBOX"
    );

    const exists =
      client.mailbox?.exists || 0;

    if (!exists) {
      await account.update({
        status: "active",
        lastSyncedAt: new Date(),
        lastError: null,
      });

      return {
        scanned: 0,
        imported: 0,
        skipped: 0,
        errors: [],
      };
    }

    /*
     * Initial sync:
     * fetch only the newest bounded set.
     *
     * Later incremental syncs also fetch a bounded recent window and
     * deduplicate by Message-ID. This is safe with the current schema,
     * which does not yet store provider UID/UIDVALIDITY.
     */
    const start = Math.max(
      1,
      exists - limit + 1
    );

    const range = `${start}:*`;

    for await (
      const message of client.fetch(
        range,
        {
          uid: true,
          flags: true,
          source: true,
        }
      )
    ) {
      scanned += 1;

      try {
        const result =
          await saveIncomingMessage({
            account,
            uid: message.uid,
            flags: message.flags,
            source: message.source,
          });

        if (result.created) {
          imported += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        errors.push({
          uid: message.uid,
          message:
            error?.message ||
            "Unable to import message",
        });
      }
    }

    const lastError =
      errors.length > 0
        ? `${errors.length} message(s) failed during synchronization.`
        : null;

    await account.update({
      status:
        errors.length === scanned &&
        scanned > 0
          ? "error"
          : "active",

      lastSyncedAt: new Date(),

      lastError,
    });

    return {
      scanned,
      imported,
      skipped,
      errors,
    };
  } catch (error) {
    await account.update({
      status: "error",

      lastError:
        error?.message ||
        "Mailbox synchronization failed.",
    });

    throw error;
  } finally {
    if (lock) {
      lock.release();
    }

    try {
      if (client.usable) {
        await client.logout();
      }
    } catch {
      /*
       * Do not hide the original synchronization result because
       * logout itself failed.
       */
    }
  }
}

export async function syncAccessibleAccount(
  req,
  accountId,
  options = {}
) {
  const where = {
    id: accountId,
  };

  if (req.companyId) {
    where.companyId = req.companyId;
  }

  /*
   * Ordinary users may synchronize only their own mailbox.
   *
   * Keep Super Admin handling compatible with the project's existing
   * convention where req.companyId can be null for cross-company scope.
   */
  if (
    req.user?.role !== "Super Admin" &&
    req.user?.role?.name !== "Super Admin"
  ) {
    where.userId = req.user.id;
  }

  const account =
    await EmailAccount.findOne({
      where,
    });

  if (!account) {
    const error = new Error(
      "Email account not found."
    );

    error.status = 404;

    throw error;
  }

  return syncEmailAccount(
    account,
    options
  );
}

export async function syncUserMailboxes(
  req,
  options = {}
) {
  const where = {
    status: {
      [Op.ne]: "disconnected",
    },

    syncEnabled: true,
  };

  if (req.companyId) {
    where.companyId = req.companyId;
  }

  if (
    req.user?.role !== "Super Admin" &&
    req.user?.role?.name !== "Super Admin"
  ) {
    where.userId = req.user.id;
  }

  const accounts =
    await EmailAccount.findAll({
      where,

      order: [
        ["isDefault", "DESC"],
        ["createdAt", "ASC"],
      ],
    });

  const results = [];

  for (const account of accounts) {
    try {
      const result =
        await syncEmailAccount(
          account,
          options
        );

      results.push({
        accountId: account.id,
        email: account.email,
        success: true,
        ...result,
      });
    } catch (error) {
      results.push({
        accountId: account.id,
        email: account.email,
        success: false,
        error:
          error?.message ||
          
          "Synchronization failed",
      });
    }
  }

  return results;
}
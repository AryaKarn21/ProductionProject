import { memo } from "react";
import {
  ArrowLeft,
  Archive,
  Forward,
  Mail,
  Paperclip,
  Reply,
  ReplyAll,
  Star,
  Trash2,
} from "lucide-react";

function getSenderName(email) {
  return (
    email?.fromName ||
    email?.fromAddress ||
    email?.from ||
    "Unknown sender"
  );
}

function getSenderAddress(email) {
  return (
    email?.fromAddress ||
    email?.from ||
    ""
  );
}

function getInitials(value) {
  const text = String(value || "?").trim();

  if (!text) {
    return "?";
  }

  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function normalizeAddress(address) {
  if (!address) {
    return "";
  }

  if (typeof address === "string") {
    return address;
  }

  if (address.name && address.address) {
    return `${address.name} <${address.address}>`;
  }

  return (
    address.address ||
    address.email ||
    address.name ||
    ""
  );
}

function formatAddresses(addresses) {
  if (!addresses) {
    return "";
  }

  if (!Array.isArray(addresses)) {
    return normalizeAddress(addresses);
  }

  return addresses
    .map(normalizeAddress)
    .filter(Boolean)
    .join(", ");
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function EmailPreview({
  email,
  onClose,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
  onToggleStar,
}) {
  /*
   * No message selected.
   *
   * Desktop keeps this state visible in the preview pane.
   * Mobile hides the preview pane from Inbox.jsx until a message
   * is selected.
   */
  if (!email) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-white px-6 text-center dark:bg-gray-950">
        <div className="max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Mail size={26} />
          </div>

          <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
            Select an email
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Choose a message from your inbox to read
            its contents here.
          </p>
        </div>
      </div>
    );
  }

  const senderName = getSenderName(email);
  const senderAddress = getSenderAddress(email);

  const subject =
    email?.subject?.trim() ||
    "(No subject)";

  const isStarred =
    email?.isStarred ??
    email?.starred ??
    false;

  const hasAttachments =
    email?.hasAttachments ??
    email?.hasAttachment ??
    false;

  const recipients = formatAddresses(
    email?.toAddresses ||
      email?.to
  );

  const ccRecipients = formatAddresses(
    email?.ccAddresses ||
      email?.cc
  );

  const messageDate = formatDate(
    email?.deliveredAt ||
      email?.sentAt ||
      email?.createdAt
  );

  /*
   * Render plain text only for now.
   *
   * Incoming HTML email is untrusted content. Do not render
   * email.bodyHtml with dangerouslySetInnerHTML until a proper
   * HTML sanitization strategy is connected.
   */
  const body =
    email?.bodyText ||
    email?.text ||
    email?.snippet ||
    email?.preview ||
    "";

  const stopPropagation = (event) => {
    event.stopPropagation();
  };

  return (
    <article className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white dark:bg-gray-950">
      {/* Top Toolbar */}
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-3 dark:border-gray-800 sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to inbox"
            title="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white lg:hidden"
          >
            <ArrowLeft size={18} />
          </button>

          <button
            type="button"
            onClick={(event) => {
              stopPropagation(event);
              onArchive?.(email);
            }}
            aria-label="Archive email"
            title="Archive"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
          >
            <Archive size={17} />
          </button>

          <button
            type="button"
            onClick={(event) => {
              stopPropagation(event);
              onDelete?.(email);
            }}
            aria-label="Delete email"
            title="Delete"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          >
            <Trash2 size={17} />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              stopPropagation(event);
              onToggleStar?.(email);
            }}
            aria-label={
              isStarred
                ? "Remove star"
                : "Star email"
            }
            title={
              isStarred
                ? "Remove star"
                : "Star"
            }
            className={[
              "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              isStarred
                ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                : "text-gray-500 hover:bg-gray-100 hover:text-amber-500 dark:text-gray-400 dark:hover:bg-gray-900",
            ].join(" ")}
          >
            <Star
              size={17}
              fill={
                isStarred
                  ? "currentColor"
                  : "none"
              }
            />
          </button>

          {/*
            A "More actions" button used to sit here with no onClick and
            no menu behind it — it was reachable from all seven mail
            folders and did nothing. Removed rather than disabled: there
            is no partially-working feature to signal, and the reply /
            star / archive / delete controls beside it already cover
            every action this component actually supports.
          */}
        </div>
      </div>

      {/* Scrollable Message */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Header */}
        <header className="border-b border-gray-100 px-4 py-5 dark:border-gray-900 sm:px-6">
          <h1 className="break-words text-xl font-semibold leading-7 text-gray-950 dark:text-white sm:text-2xl">
            {subject}
          </h1>

          <div className="mt-5 flex min-w-0 items-start gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white sm:h-11 sm:w-11"
            >
              {getInitials(senderName)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {senderName}
                  </p>

                  {senderAddress &&
                    senderAddress !== senderName && (
                      <p className="mt-0.5 break-all text-xs text-gray-500 dark:text-gray-400">
                        &lt;{senderAddress}&gt;
                      </p>
                    )}
                </div>

                {messageDate && (
                  <time className="shrink-0 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {messageDate}
                  </time>
                )}
              </div>

              <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                <p className="break-words">
                  <span className="font-medium">
                    To:
                  </span>{" "}
                  {recipients || "me"}
                </p>

                {ccRecipients && (
                  <p className="break-words">
                    <span className="font-medium">
                      Cc:
                    </span>{" "}
                    {ccRecipients}
                  </p>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Message Body */}
        <div className="px-4 py-6 sm:px-6">
          {body ? (
            <div className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-700 dark:text-gray-300 sm:text-[15px]">
              {body}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 px-5 py-8 text-center dark:border-gray-800">
              <Mail
                size={22}
                className="mx-auto text-gray-400"
              />

              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                This email does not contain
                plain-text content.
              </p>
            </div>
          )}

          {/* Attachment status */}
          {hasAttachments && (
            <section
              aria-label="Attachments"
              className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50"
            >
              <div className="flex items-center gap-2">
                <Paperclip
                  size={17}
                  className="text-gray-500 dark:text-gray-400"
                />

                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Attachments
                </h2>
              </div>

              {Array.isArray(
                email?.attachments
              ) &&
              email.attachments.length >
                0 ? (
                <div className="mt-3 space-y-2">
                  {email.attachments.map(
                    (attachment) => (
                      <div
                        key={
                          attachment.id ||
                          attachment.filename ||
                          attachment.name
                        }
                        className="flex min-w-0 items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950"
                      >
                        <Paperclip
                          size={16}
                          className="shrink-0 text-gray-400"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                            {attachment.filename ||
                              attachment.name ||
                              "Attachment"}
                          </p>

                          {attachment.sizeBytes !=
                            null && (
                            <p className="mt-0.5 text-xs text-gray-500">
                              {formatFileSize(
                                attachment.sizeBytes
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  This message contains attachments.
                  Attachment downloads will become
                  available when the secure attachment
                  API is connected.
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Actions */}
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-6">
        <button
          type="button"
          onClick={() => onReply?.(email)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
        >
          <Reply size={16} />
          Reply
        </button>

        <button
          type="button"
          onClick={() =>
            onReplyAll?.(email)
          }
          className="hidden min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900 sm:inline-flex"
        >
          <ReplyAll size={16} />
          Reply all
        </button>

        <button
          type="button"
          onClick={() =>
            onForward?.(email)
          }
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
        >
          <Forward size={16} />
          Forward
        </button>
      </footer>
    </article>
  );
}

function formatFileSize(bytes) {
  const value = Number(bytes);

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return "";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(
      value / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    value /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

export default memo(EmailPreview);
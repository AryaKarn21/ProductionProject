import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  Save,
  Send,
  X,
} from "lucide-react";

import emailAPI from "@/api/email.api";

const INITIAL_FORM = {
  accountId: "",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
};

function normalizeAccounts(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.accounts)) {
    return data.accounts;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.data?.accounts)) {
    return data.data.accounts;
  }

  return [];
}

function parseRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateRecipientField(value) {
  const recipients = parseRecipients(value);

  return (
    recipients.length > 0 &&
    recipients.every(isValidEmail)
  );
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 25 MB per file / 10 files max — mirrors the backend's uploadEmailAttachment
// limits so the user gets instant feedback instead of a round-trip error.
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

function getAccountLabel(account) {
  const name =
    account?.displayName ||
    account?.name ||
    "";

  const address =
    account?.emailAddress ||
    account?.email ||
    account?.username ||
    "";

  if (name && address) {
    return `${name} <${address}>`;
  }

  return (
    address ||
    name ||
    "Email account"
  );
}

export default function Compose() {
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();

  /*
   * Deep-link support: other pages (e.g. an employee's "Send Email"
   * button) link here as /email/compose?to=someone@x.com&subject=...
   * so the recipient/subject arrive pre-filled instead of forcing the
   * user to retype an address the app already knows.
   */
  const [form, setForm] =
    useState(() => ({
      ...INITIAL_FORM,
      to: searchParams.get("to") || "",
      subject: searchParams.get("subject") || "",
      body: searchParams.get("body") || "",
    }));

  const [showCc, setShowCc] =
    useState(false);

  const [showBcc, setShowBcc] =
    useState(false);

  const [
    validationError,
    setValidationError,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const fileInputRef = useRef(null);

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (event) => {
    const incoming = Array.from(event.target.files || []);
    // Allow picking the same file again later by clearing the input value.
    event.target.value = "";

    if (!incoming.length) return;

    setAttachmentError("");

    setAttachments((previous) => {
      const combined = [...previous];

      for (const file of incoming) {
        if (combined.length >= MAX_ATTACHMENTS) {
          setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
          break;
        }
        if (file.size > MAX_ATTACHMENT_SIZE) {
          setAttachmentError(`"${file.name}" is over the 25 MB limit.`);
          continue;
        }
        const isDuplicate = combined.some(
          (existing) => existing.name === file.name && existing.size === file.size
        );
        if (!isDuplicate) combined.push(file);
      }

      return combined;
    });
  };

  const handleRemoveAttachment = (index) => {
    setAttachments((previous) => previous.filter((_, i) => i !== index));
  };

  const {
    data: accountsData,
    isLoading: accountsLoading,
    isError: accountsError,
    error: accountsQueryError,
  } = useQuery({
    queryKey: ["email", "accounts"],

    queryFn: () =>
      emailAPI.getAccounts(),

    staleTime: 60_000,

    refetchOnWindowFocus: false,
  });

  const accounts = useMemo(
    () =>
      normalizeAccounts(
        accountsData
      ),
    [accountsData]
  );

  const availableAccounts =
    useMemo(() => {
      const active =
        accounts.filter(
          (account) =>
            account?.isActive !== false
        );

      return active.length
        ? active
        : accounts;
    }, [accounts]);

  /*
   * Automatically select the user's default email account.
   * If no default exists, use the first available account.
   */
  useEffect(() => {
    if (
      form.accountId ||
      !availableAccounts.length
    ) {
      return;
    }

    const defaultAccount =
      availableAccounts.find(
        (account) =>
          account?.isDefault === true
      ) ||
      availableAccounts[0];

    if (!defaultAccount?.id) {
      return;
    }

    setForm((previous) => ({
      ...previous,
      accountId:
        defaultAccount.id,
    }));
  }, [
    availableAccounts,
    form.accountId,
  ]);

  const sendMutation =
    useMutation({
      mutationFn: (payload) =>
        emailAPI.sendEmail(
          payload
        ),

      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [
              "emails",
              "sent",
            ],
          }),

          queryClient.invalidateQueries({
            queryKey: [
              "emails",
              "drafts",
            ],
          }),
        ]);

        resetForm();

        setSuccessMessage(
          "Email sent successfully."
        );
      },
    });

  const draftMutation =
    useMutation({
      mutationFn: (payload) =>
        emailAPI.saveDraft(
          payload
        ),

      onSuccess: async () => {
        await queryClient.invalidateQueries(
          {
            queryKey: [
              "emails",
              "drafts",
            ],
          }
        );

        resetForm();

        setSuccessMessage(
          "Draft saved successfully."
        );
      },
    });

  const isSubmitting =
    sendMutation.isPending ||
    draftMutation.isPending;

  const handleChange = (
    event
  ) => {
    const {
      name,
      value,
    } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (validationError) {
      setValidationError("");
    }

    if (successMessage) {
      setSuccessMessage("");
    }

    if (sendMutation.isError) {
      sendMutation.reset();
    }

    if (draftMutation.isError) {
      draftMutation.reset();
    }
  };

  const buildPayload = () => {
    const to =
      parseRecipients(form.to);

    const cc =
      parseRecipients(form.cc);

    const bcc =
      parseRecipients(form.bcc);

    const payload = {
      accountId:
        form.accountId,
      to,
      subject:
        form.subject.trim(),
      bodyText: form.body,
    };

    const relatedType = searchParams.get("relatedType");
    const relatedId = searchParams.get("relatedId");
    if (relatedType && relatedId) {
      payload.relatedType = relatedType;
      payload.relatedId = relatedId;
    }

    if (cc.length) {
      payload.cc = cc;
    }

    if (bcc.length) {
      payload.bcc = bcc;
    }

    if (attachments.length) {
      payload.attachments = attachments;
    }

    return payload;
  };

  const validateSend = () => {
    if (!form.accountId) {
      return "Select an email account.";
    }

    if (!form.to.trim()) {
      return "Add at least one recipient.";
    }

    if (
      !validateRecipientField(
        form.to
      )
    ) {
      return "Enter valid recipient email addresses.";
    }

    if (
      form.cc.trim() &&
      !validateRecipientField(
        form.cc
      )
    ) {
      return "Enter valid Cc email addresses.";
    }

    if (
      form.bcc.trim() &&
      !validateRecipientField(
        form.bcc
      )
    ) {
      return "Enter valid Bcc email addresses.";
    }

    if (
      !form.subject.trim()
    ) {
      return "Enter an email subject.";
    }

    if (!form.body.trim()) {
      return "Write a message before sending.";
    }

    return "";
  };

  const handleSend = (
    event
  ) => {
    event?.preventDefault();

    if (isSubmitting) {
      return;
    }

    const error =
      validateSend();

    if (error) {
      setValidationError(
        error
      );

      return;
    }

    setValidationError("");
    setSuccessMessage("");

    sendMutation.mutate(
      buildPayload()
    );
  };

  const handleSaveDraft = () => {
    if (isSubmitting) {
      return;
    }

    if (!form.accountId) {
      setValidationError(
        "Select an email account before saving the draft."
      );

      return;
    }

    const hasContent =
      form.to.trim() ||
      form.cc.trim() ||
      form.bcc.trim() ||
      form.subject.trim() ||
      form.body.trim();

    if (!hasContent) {
      setValidationError(
        "There is nothing to save as a draft."
      );

      return;
    }

    setValidationError("");
    setSuccessMessage("");

    draftMutation.mutate(
      buildPayload()
    );
  };

  const resetForm = () => {
    const defaultAccount =
      availableAccounts.find(
        (account) =>
          account?.isDefault === true
      ) ||
      availableAccounts[0];

    setForm({
      ...INITIAL_FORM,

      accountId:
        defaultAccount?.id ||
        "",
    });

    setShowCc(false);
    setShowBcc(false);

    setValidationError("");

    setAttachments([]);
    setAttachmentError("");

    sendMutation.reset();
    draftMutation.reset();
  };

  const handleDiscard = () => {
    if (isSubmitting) {
      return;
    }

    resetForm();
    setSuccessMessage("");
  };

  const mutationError =
    sendMutation.error ||
    draftMutation.error;

  const errorMessage =
    validationError ||
    attachmentError ||
    (mutationError
      ? getErrorMessage(
          mutationError,
          "Unable to process the email."
        )
      : "");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col">
      {/* Page Header */}
      <header className="mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Mail size={21} />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-2xl">
              Compose Email
            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create and send a new
              message.
            </p>
          </div>
        </div>
      </header>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="flex min-h-[600px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950"
      >
        {/* Composer Header */}
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-800 sm:px-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            New Message
          </h2>

          <button
            type="button"
            onClick={
              handleDiscard
            }
            disabled={
              isSubmitting
            }
            aria-label="Discard message"
            title="Discard"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* From */}
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5">
          <div className="grid gap-2 sm:grid-cols-[70px_minmax(0,1fr)] sm:items-center">
            <label
              htmlFor="compose-account"
              className="text-sm font-medium text-gray-500 dark:text-gray-400"
            >
              From
            </label>

            <div className="relative min-w-0">
              <select
                id="compose-account"
                name="accountId"
                value={
                  form.accountId
                }
                onChange={
                  handleChange
                }
                disabled={
                  accountsLoading ||
                  isSubmitting
                }
                className="h-10 w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 pr-10 text-sm text-gray-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
              >
                <option value="">
                  {accountsLoading
                    ? "Loading accounts..."
                    : "Select email account"}
                </option>

                {availableAccounts.map(
                  (account) => (
                    <option
                      key={
                        account.id
                      }
                      value={
                        account.id
                      }
                    >
                      {getAccountLabel(
                        account
                      )}

                      {account.isDefault
                        ? " — Default"
                        : ""}
                    </option>
                  )
                )}
              </select>

              <ChevronDown
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>
          </div>

          {accountsError && (
            <p className="mt-2 text-sm text-red-500 sm:ml-[86px]">
              {getErrorMessage(
                accountsQueryError,
                "Unable to load email accounts."
              )}
            </p>
          )}

          {!accountsLoading &&
            !accountsError &&
            !availableAccounts.length && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400 sm:ml-[86px]">
                No email account is
                available.{" "}
                <Link
                  to="/email/settings"
                  className="font-semibold underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
                >
                  Connect an email account
                </Link>{" "}
                before sending messages.
              </p>
            )}
        </div>

        {/* Recipients */}
        <div className="border-b border-gray-200 dark:border-gray-800">
          {/* To */}
          <div className="flex min-w-0 items-center gap-3 px-4 sm:px-5">
            <label
              htmlFor="compose-to"
              className="w-10 shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-[70px]"
            >
              To
            </label>

            <input
              id="compose-to"
              name="to"
              type="text"
              value={form.to}
              onChange={
                handleChange
              }
              disabled={
                isSubmitting
              }
              autoComplete="off"
              placeholder="recipient@example.com"
              className="h-12 min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-white"
            />

            <div className="flex shrink-0 items-center gap-1">
              {!showCc && (
                <button
                  type="button"
                  onClick={() =>
                    setShowCc(
                      true
                    )
                  }
                  className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
                >
                  Cc
                </button>
              )}

              {!showBcc && (
                <button
                  type="button"
                  onClick={() =>
                    setShowBcc(
                      true
                    )
                  }
                  className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
                >
                  Bcc
                </button>
              )}
            </div>
          </div>

          {/* Cc */}
          {showCc && (
            <div className="flex min-w-0 items-center gap-3 border-t border-gray-100 px-4 dark:border-gray-900 sm:px-5">
              <label
                htmlFor="compose-cc"
                className="w-10 shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-[70px]"
              >
                Cc
              </label>

              <input
                id="compose-cc"
                name="cc"
                type="text"
                value={
                  form.cc
                }
                onChange={
                  handleChange
                }
                disabled={
                  isSubmitting
                }
                autoComplete="off"
                placeholder="cc@example.com"
                className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-white"
              />

              <button
                type="button"
                onClick={() => {
                  setShowCc(false);

                  setForm(
                    (
                      previous
                    ) => ({
                      ...previous,
                      cc: "",
                    })
                  );
                }}
                aria-label="Remove Cc field"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Bcc */}
          {showBcc && (
            <div className="flex min-w-0 items-center gap-3 border-t border-gray-100 px-4 dark:border-gray-900 sm:px-5">
              <label
                htmlFor="compose-bcc"
                className="w-10 shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-[70px]"
              >
                Bcc
              </label>

              <input
                id="compose-bcc"
                name="bcc"
                type="text"
                value={
                  form.bcc
                }
                onChange={
                  handleChange
                }
                disabled={
                  isSubmitting
                }
                autoComplete="off"
                placeholder="bcc@example.com"
                className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-white"
              />

              <button
                type="button"
                onClick={() => {
                  setShowBcc(false);

                  setForm(
                    (
                      previous
                    ) => ({
                      ...previous,
                      bcc: "",
                    })
                  );
                }}
                aria-label="Remove Bcc field"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Subject */}
        <div className="flex min-w-0 items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800 sm:px-5">
          <label
            htmlFor="compose-subject"
            className="w-10 shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-[70px]"
          >
            Subject
          </label>

          <input
            id="compose-subject"
            name="subject"
            type="text"
            value={
              form.subject
            }
            onChange={
              handleChange
            }
            disabled={
              isSubmitting
            }
            placeholder="Email subject"
            className="h-12 min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 disabled:opacity-60 dark:text-white"
          />
        </div>

        {/* Message Body */}
        <div className="min-h-[300px] flex-1 p-4 sm:p-5">
          <textarea
            id="compose-body"
            name="body"
            value={form.body}
            onChange={
              handleChange
            }
            disabled={
              isSubmitting
            }
            placeholder="Write your message..."
            aria-label="Email message"
            className="h-full min-h-[300px] w-full resize-none border-0 bg-transparent text-sm leading-7 text-gray-800 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-gray-200"
          />
        </div>

        {/* Status */}
        {(errorMessage ||
          successMessage) && (
          <div className="shrink-0 px-4 pb-3 sm:px-5">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400"
              >
                <AlertCircle
                  size={17}
                  className="mt-0.5 shrink-0"
                />

                <span>
                  {errorMessage}
                </span>
              </div>
            )}

            {successMessage && (
              <div
                role="status"
                className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-400"
              >
                {successMessage}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50/50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={
                isSubmitting ||
                accountsLoading ||
                !availableAccounts.length
              }
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-950"
            >
              {sendMutation.isPending ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                  Sending...
                </>
              ) : (
                <>
                  <Send
                    size={16}
                  />
                  Send
                </>
              )}
            </button>

            <button
              type="button"
              onClick={
                handleSaveDraft
              }
              disabled={
                isSubmitting ||
                accountsLoading ||
                !availableAccounts.length
              }
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              {draftMutation.isPending ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                  Saving...
                </>
              ) : (
                <>
                  <Save
                    size={16}
                  />
                  Save Draft
                </>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleFilesSelected}
            />

            <button
              type="button"
              onClick={handleAttachClick}
              disabled={isSubmitting}
              aria-label="Attach file"
              title="Attach file"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
            >
              <Paperclip
                size={18}
              />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 text-xs text-gray-500 sm:flex">
              <FileText
                size={14}
              />

              <span>
                {form.body.length.toLocaleString()}{" "}
                characters
              </span>
            </div>

            <button
              type="button"
              onClick={
                handleDiscard
              }
              disabled={
                isSubmitting
              }
              className="min-h-10 rounded-lg px-3 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
            >
              Discard
            </button>
          </div>
        </footer>

        {/* Selected attachments */}
        {attachments.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-gray-200 bg-gray-50/50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
            {attachments.map((file, index) => (
              <span
                key={`${file.name}-${file.size}-${index}`}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
              >
                <FileText size={13} className="shrink-0 text-gray-400" />
                <span className="max-w-[160px] truncate">{file.name}</span>
                <span className="shrink-0 text-gray-400">
                  {formatFileSize(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(index)}
                  disabled={isSubmitting}
                  aria-label={`Remove ${file.name}`}
                  className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
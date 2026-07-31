import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useQuery,
} from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, History as HistoryIcon } from "lucide-react";

import emailAPI from "@/api/email.api";

import EmailList from "@/components/email/EmailList";
import EmailPreview from "@/components/email/EmailPreview";

const PAGE_SIZE = 25;

/*
 * Combined chronological log of everything sent and received, backed by
 * GET /email/history. Each row already carries a `direction` field
 * ("sent" | "received") from the backend so we can badge it without
 * re-deriving it from `folder` client-side.
 */
export default function History() {
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState("all"); // all | sent | received

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["emails", "history", page, PAGE_SIZE],

    queryFn: () =>
      emailAPI.getHistory({
        page,
        limit: PAGE_SIZE,
      }),

    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const response = data?.data ?? data;

  const allEmails = useMemo(() => {
    if (Array.isArray(response?.emails)) return response.emails;
    if (Array.isArray(response)) return response;
    return [];
  }, [response]);

  const emails = useMemo(() => {
    if (direction === "all") return allEmails;
    return allEmails.filter((email) => email.direction === direction);
  }, [allEmails, direction]);

  const pagination = response?.pagination ?? {
    page,
    limit: PAGE_SIZE,
    total: allEmails.length,
    totalPages: allEmails.length ? 1 : 0,
    hasNextPage: false,
    hasPreviousPage: page > 1,
  };

  useEffect(() => {
    if (!selectedEmail) return;
    const stillExists = emails.some((email) => email.id === selectedEmail.id);
    if (!stillExists) setSelectedEmail(null);
  }, [emails, selectedEmail]);

  useEffect(() => {
    setSelectedEmails((previous) =>
      previous.filter((id) => emails.some((email) => email.id === id))
    );
  }, [emails]);

  const handlePageChange = (nextPage) => {
    const totalPages = Number(pagination.totalPages || 0);
    if (nextPage < 1) return;
    if (totalPages > 0 && nextPage > totalPages) return;
    if (nextPage === page) return;

    setSelectedEmail(null);
    setSelectedEmails([]);
    setPage(nextPage);
  };

  if (isError) {
    return (
      <div
        role="alert"
        className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center sm:p-8"
      >
        <h2 className="text-lg font-semibold text-red-500 sm:text-xl">
          Failed to load history
        </h2>

        <p className="mt-2 max-w-md text-sm text-red-400">
          {error?.response?.data?.message ||
            error?.message ||
            "Unable to load email history."}
        </p>

        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 min-h-10 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isFetching}
        >
          {isFetching ? "Retrying..." : "Retry"}
        </button>
      </div>
    );
  }

  const filters = [
    { key: "all", label: "All", icon: HistoryIcon },
    { key: "received", label: "Received", icon: ArrowDownLeft },
    { key: "sent", label: "Sent", icon: ArrowUpRight },
  ];

  return (
    <div className="flex h-[calc(100dvh-180px)] min-h-[500px] min-w-0 flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 items-center gap-2 px-1">
        {filters.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setDirection(key);
              setSelectedEmail(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              direction === key
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section
          aria-label="Email history"
          className={[
            "min-h-0 min-w-0 overflow-hidden",
            "w-full lg:w-[38%] lg:max-w-[560px] lg:border-r",
            "border-slate-200 dark:border-slate-800",
            selectedEmail ? "hidden lg:block" : "block",
          ].join(" ")}
        >
          <EmailList
            emails={emails}
            loading={isLoading}
            fetching={isFetching}
            selectedEmails={selectedEmails}
            onToggleSelect={(id) =>
              setSelectedEmails((previous) =>
                previous.includes(id)
                  ? previous.filter((emailId) => emailId !== id)
                  : [...previous, id]
              )
            }
            onSelectEmail={setSelectedEmail}
          />

          {!isLoading && pagination.total > 0 && (
            <div className="flex min-h-14 items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 dark:border-slate-800 sm:px-4">
              <p className="min-w-0 truncate text-xs text-slate-500 sm:text-sm">
                {Number(pagination.total).toLocaleString()}{" "}
                {Number(pagination.total) === 1 ? "email" : "emails"}
              </p>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={
                    isFetching ||
                    !(pagination.hasPreviousPage ?? page > 1)
                  }
                  className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm"
                >
                  Previous
                </button>

                <span className="whitespace-nowrap text-xs text-slate-500 sm:text-sm">
                  {page}
                  {Number(pagination.totalPages) > 0
                    ? ` / ${pagination.totalPages}`
                    : ""}
                </span>

                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={
                    isFetching ||
                    !(
                      pagination.hasNextPage ??
                      page < Number(pagination.totalPages || 0)
                    )
                  }
                  className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        <section
          aria-label="Email preview"
          className={[
            "min-h-0 min-w-0 flex-1 overflow-hidden",
            selectedEmail ? "block" : "hidden lg:block",
          ].join(" ")}
        >
          <EmailPreview email={selectedEmail} onClose={() => setSelectedEmail(null)} />
        </section>
      </div>
    </div>
  );
}
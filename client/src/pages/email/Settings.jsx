import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import UserFormModal from './users/UserFormModal'
import {
  AlertCircle,
  Archive,
  FileText,
  Inbox,
  Mail,
  RefreshCw,
  Send,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import emailAPI from "@/api/email.api";

const MAILBOXES = [
  {
    key: "inbox",
    label: "Inbox",
    icon: Inbox,
    queryFn: () =>
      emailAPI.getInbox({
        page: 1,
        limit: 1,
      }),
  },
  {
    key: "sent",
    label: "Sent",
    icon: Send,
    queryFn: () =>
      emailAPI.getSent({
        page: 1,
        limit: 1,
      }),
  },
  {
    key: "drafts",
    label: "Drafts",
    icon: FileText,
    queryFn: () =>
      emailAPI.getDrafts({
        page: 1,
        limit: 1,
      }),
  },
  {
    key: "starred",
    label: "Starred",
    icon: Star,
    queryFn: () =>
      emailAPI.getStarred({
        page: 1,
        limit: 1,
      }),
  },
  {
    key: "archive",
    label: "Archive",
    icon: Archive,
    queryFn: () =>
      emailAPI.getArchive({
        page: 1,
        limit: 1,
      }),
  },
  {
    key: "spam",
    label: "Spam",
    icon: TriangleAlert,
    queryFn: () =>
      emailAPI.getSpam({
        page: 1,
        limit: 1,
      }),
  },
  {
    key: "trash",
    label: "Trash",
    icon: Trash2,
    queryFn: () =>
      emailAPI.getTrash({
        page: 1,
        limit: 1,
      }),
  },
];

function getEmails(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.emails)) {
    return data.emails;
  }

  if (Array.isArray(data?.data?.emails)) {
    return data.data.emails;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  return [];
}

function getTotal(data) {
  const candidates = [
    data?.pagination?.total,
    data?.pagination?.totalItems,
    data?.pagination?.count,

    data?.meta?.pagination?.total,
    data?.meta?.pagination?.totalItems,
    data?.meta?.pagination?.count,

    data?.meta?.total,
    data?.meta?.totalItems,
    data?.meta?.count,

    data?.data?.pagination?.total,
    data?.data?.pagination?.totalItems,
    data?.data?.pagination?.count,

    data?.data?.meta?.total,
    data?.data?.meta?.totalItems,
    data?.data?.meta?.count,

    data?.total,
    data?.totalItems,
    data?.count,
  ];

  const total = candidates.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      !Number.isNaN(Number(value))
  );

  if (total !== undefined) {
    return Number(total);
  }

  /*
   * Fallback only.
   *
   * If the backend does not return a total/count,
   * this represents the number of records returned
   * by the current API response, not a fabricated total.
   */
  return getEmails(data).length;
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Unable to load analytics data."
  );
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function MetricCard({
  label,
  value,
  icon: Icon,
  loading,
  error,
}) {
  return (
    <article className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
            {label}
          </p>

          {loading ? (
            <div className="mt-3 h-8 w-20 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
          ) : error ? (
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
              <AlertCircle size={15} />
              Unavailable
            </div>
          ) : (
            <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
              {formatNumber(value)}
            </p>
          )}
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
          <Icon size={19} />
        </div>
      </div>
    </article>
  );
}

function MailboxBreakdown({
  metrics,
  loading,
}) {
  const maximum = Math.max(
    ...metrics.map((metric) => metric.value),
    1
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <header className="border-b border-gray-200 px-4 py-4 dark:border-gray-800 sm:px-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Mailbox Breakdown
        </h2>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Current message totals by mailbox.
        </p>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        {loading
          ? Array.from({
              length: 7,
            }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse"
              >
                <div className="mb-2 flex justify-between gap-3">
                  <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-800" />

                  <div className="h-4 w-10 rounded bg-gray-200 dark:bg-gray-800" />
                </div>

                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800" />
              </div>
            ))
          : metrics.map((metric) => {
              const percentage =
                maximum > 0
                  ? Math.min(
                      100,
                      (metric.value / maximum) * 100
                    )
                  : 0;

              return (
                <div key={metric.key}>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <metric.icon
                        size={15}
                        className="shrink-0 text-gray-400"
                      />

                      <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                        {metric.label}
                      </span>
                    </div>

                    <span className="shrink-0 text-sm font-semibold text-gray-900 dark:text-white">
                      {metric.error
                        ? "—"
                        : formatNumber(
                            metric.value
                          )}
                    </span>
                  </div>

                  <div
                    className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-900"
                    role="progressbar"
                    aria-label={`${metric.label} message count`}
                    aria-valuemin={0}
                    aria-valuemax={maximum}
                    aria-valuenow={
                      metric.error
                        ? 0
                        : metric.value
                    }
                  >
                    <div
                      className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
                      style={{
                        width: metric.error
                          ? "0%"
                          : `${percentage}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
      </div>
    </section>
  );
}

export default function Analytics() {
  /*
   * No dedicated analytics endpoint exists in the
   * emailAPI currently provided.
   *
   * These queries therefore use the real mailbox
   * endpoints and request only one record wherever
   * the backend supports pagination. Totals are read
   * from backend pagination metadata.
   */
  const queries = useQueries({
    queries: MAILBOXES.map(
      (mailbox) => ({
        queryKey: [
          "emails",
          "analytics",
          mailbox.key,
        ],

        queryFn:
          mailbox.queryFn,

        staleTime: 60_000,

        refetchOnWindowFocus:
          false,

        retry: 1,
      })
    ),
  });

  const metrics = useMemo(
    () =>
      MAILBOXES.map(
        (mailbox, index) => ({
          ...mailbox,

          value: getTotal(
            queries[index]?.data
          ),

          loading:
            queries[index]
              ?.isLoading ?? false,

          fetching:
            queries[index]
              ?.isFetching ?? false,

          error:
            queries[index]
              ?.isError ?? false,

          errorObject:
            queries[index]
              ?.error ?? null,
        })
      ),
    [queries]
  );

  const metricMap =
    useMemo(
      () =>
        Object.fromEntries(
          metrics.map(
            (metric) => [
              metric.key,
              metric,
            ]
          )
        ),
      [metrics]
    );

  const isLoading =
    queries.some(
      (query) =>
        query.isLoading
    );

  const isFetching =
    queries.some(
      (query) =>
        query.isFetching
    );

  const failedQueries =
    metrics.filter(
      (metric) =>
        metric.error
    );

  const handleRefresh =
    async () => {
      await Promise.all(
        queries.map(
          (query) =>
            query.refetch()
        )
      );
    };

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Mail size={21} />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-2xl">
              Email Analytics
            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Overview of your email
              activity and mailbox
              distribution.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={
            handleRefresh
          }
          disabled={
            isFetching
          }
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900 md:w-auto"
        >
          <RefreshCw
            size={16}
            className={
              isFetching
                ? "animate-spin"
                : ""
            }
          />

          Refresh
        </button>
      </header>

      {/* Partial Error */}
      {failedQueries.length >
        0 && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400"
        >
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
          />

          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Some analytics could
              not be loaded
            </p>

            <p className="mt-1 text-sm">
              {failedQueries
                .map(
                  (metric) =>
                    metric.label
                )
                .join(", ")}
            </p>

            {failedQueries.length ===
              1 && (
              <p className="mt-1 break-words text-xs opacity-80">
                {getErrorMessage(
                  failedQueries[0]
                    .errorObject
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Primary KPI Cards */}
      <section
        aria-label="Email key metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Inbox"
          value={
            metricMap.inbox
              ?.value
          }
          icon={Inbox}
          loading={
            metricMap.inbox
              ?.loading
          }
          error={
            metricMap.inbox
              ?.error
          }
        />

        <MetricCard
          label="Sent"
          value={
            metricMap.sent
              ?.value
          }
          icon={Send}
          loading={
            metricMap.sent
              ?.loading
          }
          error={
            metricMap.sent
              ?.error
          }
        />

        <MetricCard
          label="Drafts"
          value={
            metricMap.drafts
              ?.value
          }
          icon={FileText}
          loading={
            metricMap.drafts
              ?.loading
          }
          error={
            metricMap.drafts
              ?.error
          }
        />

        <MetricCard
          label="Starred"
          value={
            metricMap.starred
              ?.value
          }
          icon={Star}
          loading={
            metricMap.starred
              ?.loading
          }
          error={
            metricMap.starred
              ?.error
          }
        />
      </section>

      {/* Analytics Content */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
        <MailboxBreakdown
          metrics={metrics}
          loading={isLoading}
        />

        {/* Secondary Metrics */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <MetricCard
            label="Archived"
            value={
              metricMap.archive
                ?.value
            }
            icon={Archive}
            loading={
              metricMap.archive
                ?.loading
            }
            error={
              metricMap.archive
                ?.error
            }
          />

          <MetricCard
            label="Spam"
            value={
              metricMap.spam
                ?.value
            }
            icon={
              TriangleAlert
            }
            loading={
              metricMap.spam
                ?.loading
            }
            error={
              metricMap.spam
                ?.error
            }
          />

          <MetricCard
            label="Trash"
            value={
              metricMap.trash
                ?.value
            }
            icon={Trash2}
            loading={
              metricMap.trash
                ?.loading
            }
            error={
              metricMap.trash
                ?.error
            }
          />
        </section>
      </div>

      {/* Analytics Scope */}
      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950 sm:p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Analytics Scope
        </h2>

        <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          These metrics use the
          existing mailbox APIs and
          backend-provided totals.
          Delivery rates, open rates,
          click rates, bounce rates,
          response times, and
          time-series charts require
          dedicated analytics data
          from the backend and are
          intentionally not
          fabricated on this page.
        </p>
      </section>
    </div>
  );
}
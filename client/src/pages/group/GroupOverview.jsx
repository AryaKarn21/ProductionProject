import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Building2,
  Users,
  TrendingUp,
  Wallet,
  FolderKanban,
  Headphones,
  AlertTriangle,
  Activity,
  ArrowUpRight,
} from 'lucide-react'
import { groupAPI } from '@/api/group.api'
import { formatCurrency } from '@/lib/utils'
import GroupKpiCard from './components/GroupKpiCard'
import GroupEmptyState from './components/GroupEmptyState'

/*
|--------------------------------------------------------------------------
| Group Console — Overview
|--------------------------------------------------------------------------
|
| The screen the parent company (OS Group) lands on: where every child
| company stands right now, in one table, plus the group totals above it.
|
| The numbers here are LIVE rollups queried straight from the child
| companies' own tables — not a cached report — so they always match what
| that company sees on its own dashboard.
*/

const PERIODS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]

export default function GroupOverview() {
  const [days, setDays] = useState(30)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['group-overview', days],
    queryFn: () => groupAPI.getOverview({ days }).then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
        <div className="h-16 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto w-full">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
          <AlertTriangle size={20} className="mx-auto text-rose-400 mb-2" />
          <p className="text-sm font-semibold text-white">Could not load the group overview</p>
          <p className="text-xs text-slate-400 mt-1">
            {error?.response?.data?.message || 'Please try again.'}
          </p>
        </div>
      </div>
    )
  }

  const { totals, byCompany, root, isEmpty } = data
  const currency = 'NPR'

  // Child companies only. The parent's own numbers are already visible on
  // its normal dashboard; repeating them here would double-count the
  // group totals in the reader's head.
  const children = byCompany.filter((row) => !row.isRoot)

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-[1600px] mx-auto w-full animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Group Console</h1>
          <p className="text-xs text-slate-400 mt-1">
            Consolidated view of {root?.name} and its {totals.childCompanies} child
            {totals.childCompanies === 1 ? ' company' : ' companies'}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                days === p.value
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <GroupEmptyState rootName={root?.name} />
      ) : (
        <>
          {/* Group totals */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <GroupKpiCard
              label="Companies"
              value={totals.childCompanies}
              sub={`plus ${root?.name}`}
              icon={Building2}
            />
            <GroupKpiCard
              label="Headcount"
              value={totals.employees}
              sub="active employees, group-wide"
              icon={Users}
            />
            <GroupKpiCard
              label="Open pipeline"
              value={formatCurrency(totals.pipelineValue, currency)}
              sub={`${totals.openOpportunities} open opportunities`}
              icon={TrendingUp}
            />
            <GroupKpiCard
              label="Closed won"
              value={formatCurrency(totals.wonValue, currency)}
              sub="all time"
              icon={TrendingUp}
              tone="good"
            />

            <GroupKpiCard
              label="Expenses awaiting approval"
              value={formatCurrency(totals.expensePending, currency)}
              sub="across all companies"
              icon={Wallet}
              tone={totals.expensePending > 0 ? 'warn' : 'default'}
            />
            <GroupKpiCard
              label="Active projects"
              value={totals.projectsActive}
              sub={
                totals.projectsOverdue > 0
                  ? `${totals.projectsOverdue} past their end date`
                  : 'none overdue'
              }
              icon={FolderKanban}
              tone={totals.projectsOverdue > 0 ? 'danger' : 'default'}
            />
            <GroupKpiCard
              label="Open tickets"
              value={totals.ticketsOpen}
              sub={`${totals.leavesPending} leave requests pending`}
              icon={Headphones}
              tone={totals.ticketsOpen > 0 ? 'warn' : 'default'}
            />
            <GroupKpiCard
              label={`Changes (${days}d)`}
              value={totals.changes}
              sub={`${totals.newLeads} new leads in period`}
              icon={Activity}
            />
          </div>

          {/* Per-company breakdown */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-white">Company breakdown</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Where each child company stands. Click a row for its full activity.
                </p>
              </div>
              <Link
                to="/group/activity"
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                Activity feed <ArrowUpRight size={12} />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Company</th>
                    <th className="p-3.5 text-right">Staff</th>
                    <th className="p-3.5 text-right">Leads</th>
                    <th className="p-3.5 text-right">Pipeline</th>
                    <th className="p-3.5 text-right">Pending expenses</th>
                    <th className="p-3.5 text-right">Projects</th>
                    <th className="p-3.5 text-right">Open tickets</th>
                    <th className="p-3.5 text-right">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {children.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-slate-500">
                        No child companies to report on.
                      </td>
                    </tr>
                  ) : (
                    children.map((row) => (
                      <tr
                        key={row.company.id}
                        className="hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="p-3.5">
                          <Link
                            to={`/group/companies/${row.company.id}`}
                            className="font-semibold text-slate-200 hover:text-blue-400 transition-colors"
                          >
                            {row.company.name}
                          </Link>
                          {row.company.type && (
                            <p className="text-[11px] text-slate-500">{row.company.type}</p>
                          )}
                        </td>
                        <td className="p-3.5 text-right tabular-nums">{row.employees}</td>
                        <td className="p-3.5 text-right tabular-nums">
                          {row.leads}
                          {row.newLeads > 0 && (
                            <span className="text-emerald-400 ml-1">+{row.newLeads}</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right tabular-nums">
                          {formatCurrency(row.pipelineValue, currency)}
                        </td>
                        <td
                          className={`p-3.5 text-right tabular-nums ${
                            row.expensePending > 0 ? 'text-amber-400' : ''
                          }`}
                        >
                          {formatCurrency(row.expensePending, currency)}
                        </td>
                        <td className="p-3.5 text-right tabular-nums">
                          {row.projectsActive}
                          {row.projectsOverdue > 0 && (
                            <span
                              className="text-rose-400 ml-1"
                              title={`${row.projectsOverdue} past their end date`}
                            >
                              ({row.projectsOverdue} late)
                            </span>
                          )}
                        </td>
                        <td
                          className={`p-3.5 text-right tabular-nums ${
                            row.ticketsOpen > 0 ? 'text-amber-400' : ''
                          }`}
                        >
                          {row.ticketsOpen}
                        </td>
                        <td className="p-3.5 text-right tabular-nums text-slate-400">
                          {row.changes}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

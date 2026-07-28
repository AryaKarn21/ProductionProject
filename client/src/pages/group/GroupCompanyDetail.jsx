import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Users,
  TrendingUp,
  FolderKanban,
  Headphones,
  Wallet,
  Target,
} from 'lucide-react'
import { groupAPI } from '@/api/group.api'
import { formatCurrency } from '@/lib/utils'
import GroupKpiCard from './components/GroupKpiCard'
import ActivityRow from './components/ActivityRow'

/*
|--------------------------------------------------------------------------
| Group Console — one child company
|--------------------------------------------------------------------------
|
| Drill-down for a single company in the group: its profile, headline
| numbers and most recent 25 changes — without the parent-company user
| having to switch tenants, which would change their permissions and
| leave a misleading trail in that company's own audit log.
|
| Read-only by design. There is no write path on /api/group/*.
*/
export default function GroupCompanyDetail() {
  const { id } = useParams()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['group-company', id],
    queryFn: () => groupAPI.getCompany(id).then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-[1600px] mx-auto w-full space-y-4">
        <div className="h-20 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto w-full">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <p className="text-sm text-slate-300">
            {error?.response?.data?.message || 'Could not load this company.'}
          </p>
          <Link
            to="/group"
            className="inline-block mt-4 text-xs font-semibold text-blue-400 hover:text-blue-300"
          >
            Back to the Group Console
          </Link>
        </div>
      </div>
    )
  }

  const { company, stats, recentActivity } = data
  const currency = company.currency || 'NPR'

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto w-full animate-fade-in">
      <Link
        to="/group"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={13} /> Group Console
      </Link>

      {/* Profile */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">{company.name}</h1>
            <p className="text-xs text-slate-400 mt-1">
              {[company.type, company.industry].filter(Boolean).join(' · ') || 'Company'}
              {company.parent && (
                <>
                  {' · under '}
                  <span className="text-slate-300">{company.parent.name}</span>
                </>
              )}
            </p>
          </div>

          <dl className="text-xs space-y-1 sm:text-right">
            {company.email && (
              <div>
                <dt className="inline text-slate-500">Email: </dt>
                <dd className="inline text-slate-300">{company.email}</dd>
              </div>
            )}
            {company.phone && (
              <div>
                <dt className="inline text-slate-500">Phone: </dt>
                <dd className="inline text-slate-300">{company.phone}</dd>
              </div>
            )}
            {company.address && (
              <div>
                <dt className="inline text-slate-500">Address: </dt>
                <dd className="inline text-slate-300">{company.address}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <GroupKpiCard label="Headcount" value={stats.employees} sub="active employees" icon={Users} />
        <GroupKpiCard label="Leads" value={stats.leads} sub="all stages" icon={Target} />
        <GroupKpiCard
          label="Open pipeline"
          value={formatCurrency(stats.pipelineValue, currency)}
          icon={TrendingUp}
        />
        <GroupKpiCard
          label="Active projects"
          value={stats.projectsActive}
          icon={FolderKanban}
        />
        <GroupKpiCard
          label="Open tickets"
          value={stats.ticketsOpen}
          icon={Headphones}
          tone={stats.ticketsOpen > 0 ? 'warn' : 'default'}
        />
        <GroupKpiCard
          label="Expenses awaiting approval"
          value={formatCurrency(stats.expensePending, currency)}
          icon={Wallet}
          tone={stats.expensePending > 0 ? 'warn' : 'default'}
        />
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-white">Recent activity</h2>
            <p className="text-xs text-slate-400 mt-0.5">The last 25 changes at this company</p>
          </div>
          <Link
            to={`/group/activity?companyId=${company.id}`}
            className="text-[11px] font-semibold text-blue-400 hover:text-blue-300"
          >
            View all
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No activity recorded for this company yet.
          </div>
        ) : (
          recentActivity.map((log) => <ActivityRow key={log.id} log={log} />)
        )}
      </div>
    </div>
  )
}

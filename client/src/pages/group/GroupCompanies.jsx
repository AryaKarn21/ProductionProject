import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Building2, ChevronRight, Users, TrendingUp } from 'lucide-react'
import { groupAPI } from '@/api/group.api'
import { formatCurrency } from '@/lib/utils'
import GroupEmptyState from './components/GroupEmptyState'

/*
|--------------------------------------------------------------------------
| Group Console — Company Structure
|--------------------------------------------------------------------------
|
| A list of every child company under the caller's own company, each
| linking through to its own drill-down (GroupCompanyDetail).
|
| Reuses GET /group/overview rather than adding a new endpoint — it
| already returns one row per company in scope (`byCompany`), and this
| page is just a friendlier, list-shaped view of the same data the
| Overview page renders as a table.
*/
export default function GroupCompanies() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['group-companies'],
    queryFn: () => groupAPI.getOverview().then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-[1600px] mx-auto w-full space-y-3">
        <div className="h-16 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto w-full">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
          <AlertTriangle size={20} className="mx-auto text-rose-400 mb-2" />
          <p className="text-sm font-semibold text-white">Could not load your company structure</p>
          <p className="text-xs text-slate-400 mt-1">
            {error?.response?.data?.message || 'Please try again.'}
          </p>
        </div>
      </div>
    )
  }

  const { root, isEmpty, byCompany } = data
  const currency = 'NPR'

  // The root's own numbers are visible on its normal dashboard already —
  // this screen is specifically about the children beneath it.
  const children = byCompany.filter((row) => !row.isRoot)

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto w-full animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-white tracking-tight">Company Structure</h1>
        <p className="text-xs text-slate-400 mt-1">
          Every company under <span className="text-slate-300">{root?.name}</span> in the hierarchy
        </p>
      </div>

      {isEmpty || children.length === 0 ? (
        <GroupEmptyState rootName={root?.name} />
      ) : (
        <div className="space-y-3">
          {children.map((row) => (
            <Link
              key={row.company.id}
              to={`/group/companies/${row.company.id}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 hover:bg-slate-900 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-slate-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{row.company.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {row.company.type || 'Company'}
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-6 text-xs text-slate-400 flex-shrink-0">
                <span className="flex items-center gap-1.5">
                  <Users size={13} /> {row.employees} employees
                </span>
                <span className="flex items-center gap-1.5">
                  <TrendingUp size={13} /> {formatCurrency(row.pipelineValue, currency)} pipeline
                </span>
              </div>

              <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
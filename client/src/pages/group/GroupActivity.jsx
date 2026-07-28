import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Download, Search, AlertTriangle } from 'lucide-react'
import { groupAPI } from '@/api/group.api'
import usePermission from '@/hooks/usePermission'
import Pagination from '@/components/ui/Pagination'
import ActivityRow from './components/ActivityRow'
import GroupEmptyState from './components/GroupEmptyState'
import { moduleColor } from './activityLabels'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

/*
|--------------------------------------------------------------------------
| Group Console — Activity feed
|--------------------------------------------------------------------------
|
| Every change made in every child company, newest first, with the actor,
| the company and the field-level diff.
|
| This is fed by models/auditHooks.js, which records creates, updates and
| deletes across all business models automatically. Before those hooks
| existed only 9 of 28 route files logged anything, so this screen would
| have been almost entirely empty.
*/

const MODULES = [
  { value: '', label: 'All modules' },
  { value: 'crm', label: 'CRM' },
  { value: 'hr', label: 'HR' },
  { value: 'finance', label: 'Finance' },
  { value: 'projects', label: 'Projects' },
  { value: 'support', label: 'Support' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'settings', label: 'Settings' },
  { value: 'security', label: 'Security' },
]

export default function GroupActivity() {
  const { hasPermission } = usePermission()

  const [page, setPage] = useState(1)
  const [companyId, setCompanyId] = useState('')
  const [module, setModule] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [exporting, setExporting] = useState(false)

  const limit = 25

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  /*
   * Any filter change invalidates the current page number — staying on
   * page 7 of a result set that now has two pages shows an empty list.
   *
   * Done here in the change handlers rather than in an effect on
   * [companyId, module, search]: an effect would render once with the
   * new filter and the stale page, firing a throwaway request for an
   * offset that no longer exists, before correcting itself.
   */
  const applyFilter = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const filters = {
    companyId: companyId || undefined,
    module: module || undefined,
    search: debouncedSearch || undefined,
  }

  const { data: scope } = useQuery({
    queryKey: ['group-scope'],
    queryFn: () => groupAPI.getScope().then((r) => r.data),
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['group-activity', page, filters],
    queryFn: () => groupAPI.getActivity({ page, limit, ...filters }).then((r) => r.data),
    // Keeps the previous page on screen while the next one loads, instead
    // of collapsing the list to a spinner on every page change.
    placeholderData: keepPreviousData,
  })

  const { data: stats } = useQuery({
    queryKey: ['group-activity-stats', filters],
    queryFn: () => groupAPI.getActivityStats(filters).then((r) => r.data),
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await groupAPI.exportActivity(filters)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `group-activity-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Without this the blob is held for the lifetime of the document.
      URL.revokeObjectURL(url)
      toast.success('Activity exported')
    } catch {
      // The axios interceptor already surfaced the reason.
    } finally {
      setExporting(false)
    }
  }

  if (scope?.isEmpty) {
    return (
      <div className="p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
        <GroupEmptyState rootName={scope?.root?.name} />
      </div>
    )
  }

  const activity = data?.activity || []
  const total = data?.total || 0

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto w-full animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Group Activity</h1>
          <p className="text-xs text-slate-400 mt-1">
            Every change made across {scope?.childCount ?? 0} child
            {scope?.childCount === 1 ? ' company' : ' companies'}, newest first
          </p>
        </div>

        {hasPermission('group.export') && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 transition-colors"
          >
            <Download size={14} className="text-slate-400" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      {/* Volume by company — doubles as a one-click filter */}
      {stats?.byCompany?.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => applyFilter(setCompanyId)('')}
            className={cn(
              'px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors',
              !companyId
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
            )}
          >
            All companies · {stats.total}
          </button>
          {stats.byCompany.map((row) => (
            <button
              key={row.company.id}
              onClick={() => applyFilter(setCompanyId)(row.company.id)}
              className={cn(
                'px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors',
                companyId === row.company.id
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
              )}
            >
              {row.company.name} · {row.count}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="Search by record name, action or resource…"
            value={search}
            onChange={(e) => applyFilter(setSearch)(e.target.value)}
          />
        </div>

        <select
          className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          value={module}
          onChange={(e) => applyFilter(setModule)(e.target.value)}
        >
          {MODULES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Module mix */}
      {stats?.byModule?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stats.byModule.slice(0, 8).map((m) => (
            <span
              key={m.module}
              className={cn(
                'px-2 py-0.5 rounded border text-[10px] font-medium capitalize',
                moduleColor(m.module)
              )}
            >
              {m.module} · {m.count}
            </span>
          ))}
        </div>
      )}

      {/* Feed */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        {isError ? (
          <div className="p-8 text-center">
            <AlertTriangle size={18} className="mx-auto text-rose-400 mb-2" />
            <p className="text-xs text-slate-400">
              {error?.response?.data?.message || 'Could not load activity.'}
            </p>
          </div>
        ) : isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading group activity…
          </div>
        ) : activity.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-xs text-slate-400">No activity matches these filters.</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Activity is recorded from the moment a change is made — historic
              changes made before group auditing was enabled will not appear.
            </p>
          </div>
        ) : (
          activity.map((log) => <ActivityRow key={log.id} log={log} />)
        )}
      </div>

      {/* Pagination's prop is `onChange` (not `onPageChange`, which is
          DataTable's) — passing the wrong name renders the controls but
          makes every page button a no-op. */}
      <Pagination page={page} pageSize={limit} total={total} onChange={setPage} />
    </div>
  )
}

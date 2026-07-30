import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Building2, ChevronRight, Crown } from 'lucide-react'
import { groupAPI } from '@/api/group.api'
import GroupEmptyState from './components/GroupEmptyState'

/*
|--------------------------------------------------------------------------
| Group Console — Structure
|--------------------------------------------------------------------------
|
| Renders the nested company hierarchy from GET /group/scope (`tree`) —
| the parent at the top, every company beneath it nested under its actual
| parent, however many levels deep. Read-only, same as the rest of the
| Group Console: click a node to open its GroupCompanyDetail drill-down.
|
| This route previously pointed at a byte-for-byte duplicate of
| GroupCompanyDetail.jsx, which expects a :id route param. /group/structure
| has no :id, so `id` was always undefined, the company lookup always
| failed scope validation, and the page only ever showed "That company is
| not in your group" — regardless of who was logged in. Not a permissions
| bug; this page just never actually existed until now.
*/
export default function GroupStructure() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['group-scope'],
    queryFn: () => groupAPI.getScope().then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-[1000px] mx-auto w-full space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-14 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse"
            style={{ marginLeft: i * 24 }}
          />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto w-full">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <p className="text-sm text-slate-300">
            {error?.response?.data?.message || 'Could not load the company structure.'}
          </p>
        </div>
      </div>
    )
  }

  if (data.isEmpty || !data.tree?.length) {
    return (
      <div className="p-4 sm:p-6 max-w-[1000px] mx-auto w-full">
        <GroupEmptyState />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1000px] mx-auto w-full space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-white tracking-tight">Group Structure</h1>
        <p className="text-xs text-slate-400 mt-1">
          {data.root?.name || 'Your company'}, and every company beneath it in the hierarchy.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
        {data.tree.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} isRoot />
        ))}
      </div>
    </div>
  )
}

function TreeNode({ node, depth, isRoot = false }) {
  const hasChildren = node.children?.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2"
        style={{ paddingLeft: depth * 28 }}
      >
        {depth > 0 && (
          <span className="text-slate-700 text-xs select-none">└─</span>
        )}

        <Link
          to={`/group/companies/${node.id}`}
          className="group flex flex-1 items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 hover:border-slate-700 px-3 py-2.5 my-1 transition-colors min-w-0"
        >
          <div
            className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
              isRoot ? 'bg-blue-500/15 text-blue-400' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {isRoot ? <Crown size={15} /> : <Building2 size={15} />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-slate-200 truncate group-hover:text-white">
              {node.name}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {isRoot ? 'Parent company' : node.type || 'Company'}
              {node.isActive === false && (
                <span className="ml-2 text-rose-400 font-medium">Inactive</span>
              )}
              {hasChildren && (
                <span className="ml-2">
                  · {node.children.length} {node.children.length === 1 ? 'subsidiary' : 'subsidiaries'}
                </span>
              )}
            </p>
          </div>

          <ChevronRight
            size={14}
            className="shrink-0 text-slate-600 group-hover:text-slate-400 transition-colors"
          />
        </Link>
      </div>

      {hasChildren &&
        node.children.map((child) => (
          <TreeNode key={child.id} node={child} depth={depth + 1} />
        ))}
    </div>
  )
}
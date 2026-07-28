import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Building2, ChevronRight, Crown } from 'lucide-react'
import { groupAPI } from '@/api/group.api'
import { cn } from '@/lib/utils'
import GroupEmptyState from './components/GroupEmptyState'

/*
|--------------------------------------------------------------------------
| Group Console — Structure
|--------------------------------------------------------------------------
|
| The org chart: which companies sit under which, rendered from
| companies.parentId. Until now that column existed in the schema and in
| the Sequelize associations but nothing ever set it or displayed it, so
| the group structure was invisible even to a super admin.
*/
export default function GroupCompanies() {
  const { data, isLoading } = useQuery({
    queryKey: ['group-scope'],
    queryFn: () => groupAPI.getScope().then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
        <div className="h-64 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto w-full animate-fade-in">
      <div className="pb-4 border-b border-slate-800/80">
        <h1 className="text-lg font-bold text-white tracking-tight">Group Structure</h1>
        <p className="text-xs text-slate-400 mt-1">
          How {data?.root?.name} and its companies are arranged
        </p>
      </div>

      {data?.isEmpty ? (
        <GroupEmptyState rootName={data?.root?.name} />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          {(data?.tree || []).map((node) => (
            <TreeNode key={node.id} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  )
}

function TreeNode({ node, depth }) {
  const isRoot = depth === 0

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 group"
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        {depth > 0 && <ChevronRight size={12} className="text-slate-700 flex-shrink-0" />}

        <div
          className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
            isRoot ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-slate-800'
          )}
        >
          {isRoot ? (
            <Crown size={13} className="text-blue-400" />
          ) : (
            <Building2 size={13} className="text-slate-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Link
            to={`/group/companies/${node.id}`}
            className="text-xs font-semibold text-slate-200 hover:text-blue-400 transition-colors"
          >
            {node.name}
          </Link>
          <p className="text-[10px] text-slate-500">
            {[node.type, node.industry].filter(Boolean).join(' · ') || 'Company'}
          </p>
        </div>

        {node.isActive === false && (
          <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-[10px] text-slate-400">
            inactive
          </span>
        )}

        {node.children?.length > 0 && (
          <span className="text-[10px] text-slate-500">
            {node.children.length}{' '}
            {node.children.length === 1 ? 'subsidiary' : 'subsidiaries'}
          </span>
        )}
      </div>

      {node.children?.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

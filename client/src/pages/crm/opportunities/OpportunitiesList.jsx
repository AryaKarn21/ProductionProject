import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, LayoutGrid } from 'lucide-react'
import { opportunitiesAPI } from '@/api/opportunities.api'
import DataTable from '@/components/shared/DataTable'
import FilterBar from '@/components/shared/FilterBar'
import OpportunityFormModal from '@/components/shared/OpportunityFormModal'
import Badge from '@/components/ui/Badge'
import { formatDate, formatCurrency, classifyStatus } from '@/lib/utils'
import { OPPORTUNITY_STAGES } from '@/lib/constants'
import toast from 'react-hot-toast'

export default function OpportunitiesList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [params, setParams] = useState({
    page: 1,
    limit: 20,
    search: '',
    stage: searchParams.get('stage') || '',
    sortKey: 'value',
    sortDir: 'desc',
  })
  const [modalOpen, setModalOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['opportunities', params],
    queryFn: () => opportunitiesAPI.getAll(params).then(r => r.data),
  })


  /*
   * An `updateMutation` used to sit here. It was copy-pasted from
   * OpportunityEdit.jsx, which is a detail page and has a `:id` route
   * param — this is the LIST page and has none, so all three of its
   * references to `id` were undefined. It was never called from
   * anywhere in this file, so it never threw; wiring it to a button
   * would have produced a ReferenceError on the first click.
   *
   * Editing happens on the detail page, which has the working copy.
   */
  const deleteMutation = useMutation({
    mutationFn: opportunitiesAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      queryClient.invalidateQueries({ queryKey: ['opportunities-kanban'] })
      ;[
        'dashboard-stats',
        'dashboard-top-deals',
        'dashboard-won-deals',
        'dashboard-charts',
        'reports-dashboard-stats',
        'sales-report',
        'sales-forecast',
      ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      toast.success('Opportunity deleted')
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to delete opportunity'),
  })
 
  const handleFilterChange = (k, v) => {
    setParams(p => ({ ...p, [k]: v, page: 1 }))
    if (k === 'stage') {
      const next = new URLSearchParams(searchParams)
      if (v) next.set('stage', v)
      else next.delete('stage')
      setSearchParams(next, { replace: true })
    }
  }

  const columns = [
    {
      key: 'name', label: 'Opportunity', sortable: true,
      render: (val, row) => (
        <div>
          <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{val}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{row.account?.name || '—'}</p>
        </div>
      ),
    },
    {
      key: 'stage', label: 'Stage', sortable: true,
      render: (val) => <Badge variant={classifyStatus(val)} dot>{val}</Badge>,
    },
    {
      key: 'value', label: 'Value', sortable: true,
      render: (val) => <span className="font-semibold">{formatCurrency(val)}</span>,
    },
    {
      key: 'probability', label: 'Probability',
      render: (val) => val !== undefined ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] max-w-[60px]">
            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${val}%` }} />
          </div>
          <span className="text-[12px]">{val}%</span>
        </div>
      ) : '—',
    },
    { key: 'closeDate', label: 'Close Date', sortable: true, render: (val) => formatDate(val) },
    { key: 'assignedTo', label: 'Owner', render: (val) => val?.name || '—' },
    {
      key: 'id', label: '',
      render: (id) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/crm/opportunities/${id}`)}>View</button>
          <button className="btn btn-ghost btn-sm text-red-500" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(id) }}>Delete</button>
        </div>
      ),
    },
  ]

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>Opportunities</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{data?.total ?? 0} total opportunities</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button className="btn btn-secondary btn-sm flex items-center justify-center gap-1.5 w-full sm:w-auto" onClick={() => navigate('/crm/opportunities/kanban')}>
            <LayoutGrid size={14} /> Kanban
          </button>
          <button className="btn btn-primary flex items-center justify-center gap-1.5 w-full sm:w-auto" onClick={() => setModalOpen(true)}>
            <Plus size={14} /> Add Opportunity
          </button>
        </div>
      </div>
      <FilterBar
        searchPlaceholder="Search opportunities..."
        filters={[{ key: 'stage', label: 'Stage', options: OPPORTUNITY_STAGES.map(s => ({ label: s, value: s })) }]}
        values={params}
        onChange={handleFilterChange}
        resultCount={data?.total}
      />
      <div className="mx-4 sm:mx-6 mb-6 card overflow-hidden">
        <DataTable
          columns={columns}
          data={data?.opportunities || []}
          total={data?.total || 0}
          page={params.page}
          pageSize={params.limit}
          loading={isLoading}
          error={error}
          sortKey={params.sortKey}
          sortDir={params.sortDir}
          onSort={(k, d) => setParams(p => ({ ...p, sortKey: k, sortDir: d }))}
          onPageChange={(page) => setParams(p => ({ ...p, page }))}
          onRowClick={(row) => navigate(`/crm/opportunities/${row.id}`)}
          emptyTitle="No opportunities yet"
          mobileCard={(row) => (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{row.name}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{row.account?.name || '—'}</p>
                </div>
                <Badge variant={classifyStatus(row.stage)} dot>{row.stage}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-semibold">{formatCurrency(row.value)}</span>
                <span className="text-right">{formatDate(row.closeDate)}</span>
                {row.probability !== undefined && (
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--border)]">
                      <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${row.probability}%` }} />
                    </div>
                    <span>{row.probability}%</span>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t flex items-center gap-1" style={{ borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/crm/opportunities/${row.id}`)}>View</button>
                <button className="btn btn-ghost btn-sm text-red-500" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(row.id) }}>Delete</button>
              </div>
            </div>
          )}
        />
      </div>
      <OpportunityFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
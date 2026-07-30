import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { List, Plus } from 'lucide-react'
import { leadsAPI } from '@/api/leads.api'
import KanbanBoard from '@/components/shared/KanbanBoard'
import Avatar from '@/components/ui/Avatar'
import { formatCurrency } from '@/lib/utils'
import { LEAD_STAGES } from '@/lib/constants'

export default function LeadKanban() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['leads-kanban'],
    queryFn: () => leadsAPI.getAll({ limit: 200 }).then(r => r.data),
  })

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }) => leadsAPI.updateStage(id, stage),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['leads-kanban'] })
      const prev = queryClient.getQueryData(['leads-kanban'])
      queryClient.setQueryData(['leads-kanban'], (old) => ({
        ...old,
        leads: old.leads.map(l => l._id === id ? { ...l, stage } : l),
      }))
      return { prev }
    },
    onError: (_, __, ctx) => queryClient.setQueryData(['leads-kanban'], ctx.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['leads-kanban'] }),
  })

  const handleDragEnd = (result) => {
    if (!result.destination) return
    const { draggableId, destination } = result
    stageMutation.mutate({ id: draggableId, stage: destination.droppableId })
  }

  const columns = LEAD_STAGES.map((stage) => {
    const stageCards = data?.leads?.filter(l => l.stage === stage) || []
    return {
      key: stage,
      label: stage,
      total: stageCards.reduce((sum, l) => sum + (l.value || 0), 0),
    }
  })

  const cardRenderer = (card) => (
    <div>
      <div className="flex items-start gap-2 mb-2">
        <Avatar name={card.name} size="xs" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{card.name}</p>
          {card.company && <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{card.company}</p>}
        </div>
      </div>
      {card.value > 0 && (
        <p className="text-[13px] font-bold mt-2" style={{ color: 'var(--primary)' }}>{formatCurrency(card.value)}</p>
      )}
      {card.assignedTo?.name && (
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>→ {card.assignedTo.name}</p>
      )}
    </div>
  )

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>Lead Pipeline</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{data?.total ?? 0} leads</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/crm/leads')}>
            <List size={14} /> List View
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/crm/leads/new')}>
            <Plus size={14} /> Add Lead
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-4 px-6 pt-4 overflow-x-auto">
          {LEAD_STAGES.map(s => (
            <div key={s} className="w-[280px] h-[400px] rounded-xl bg-[var(--border)] animate-pulse flex-shrink-0" />
          ))}
        </div>
      ) : (
        <KanbanBoard
          columns={columns}
          cards={data?.leads || []}
          onDragEnd={handleDragEnd}
          onCardClick={(card) => navigate(`/crm/leads/${card._id}`)}
          cardRenderer={cardRenderer}
        />
      )}
    </div>
  )
}
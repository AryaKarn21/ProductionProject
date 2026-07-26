import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { supportAPI } from '@/api/support.api'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import { Tabs } from '@/components/ui/Tabs'
import { classifyStatus, formatDate } from '@/lib/utils'

export default function SupportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('overview')

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => supportAPI.getTicketById(id).then(res => res.data),
  })

  const deleteMutation = useMutation({
    mutationFn: supportAPI.deleteTicket,

    onSuccess: () => {
      toast.success('Ticket deleted')

      queryClient.invalidateQueries({
        queryKey: ['tickets'],
      })

      navigate('/support')
    },
  })

  if (isLoading) {
    return <div className="p-6">Loading...</div>
  }

  if (!ticket) return null

  const tabs = [
    {
      key: 'overview',
      label: 'Overview',
    },
    {
      key: 'replies',
      label: 'Replies',
      count: ticket.replies?.length || 0,
    },
  ]

  return (
    <div className="animate-fade-in">

      <div className="page-header">

        <div className="flex items-center gap-3">

          <button
            className="btn btn-ghost btn-icon"
            onClick={() => navigate('/support')}
          >
            <ArrowLeft size={16} />
          </button>

          <div>
            <h1
              className="text-[18px] font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {ticket.subject}
            </h1>

            <p
              className="text-[12px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Ticket #{ticket.ticketId}
            </p>

          </div>

          <Badge
            variant={classifyStatus(ticket.status)}
            dot
          >
            {ticket.status}
          </Badge>

        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => navigate(`/support/${id}/edit`)}
        >
          Edit
        </button>

      </div>

      <div className="p-6 flex flex-col lg:flex-row gap-6">

        <div className="flex-1 card overflow-hidden">

          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
          />

          <div className="p-5">

            {activeTab === 'overview' && (

              <div className="grid grid-cols-2 gap-5">

                <div className="col-span-2">

                  <p className="text-[11px] uppercase font-semibold mb-1">
                    Description
                  </p>

                  <p className="text-[13px]">
                    {ticket.description}
                  </p>

                </div>

                <div>

                  <p className="text-[11px] uppercase font-semibold mb-1">
                    Priority
                  </p>

                  <Badge>
                    {ticket.priority}
                  </Badge>

                </div>

                <div>

                  <p className="text-[11px] uppercase font-semibold mb-1">
                    Category
                  </p>

                  <p className="text-[13px]">
                    {ticket.category || 'General'}
                  </p>

                </div>

                <div>

                  <p className="text-[11px] uppercase font-semibold mb-1">
                    Created By
                  </p>

                  <div className="flex items-center gap-2">

                    <Avatar
                      name={ticket.createdBy?.name}
                      size="sm"
                    />

                    <span>
                      {ticket.createdBy?.name}
                    </span>

                  </div>

                </div>

                <div>

                  <p className="text-[11px] uppercase font-semibold mb-1">
                    Assigned To
                  </p>

                  {ticket.assignedTo ? (

                    <div className="flex items-center gap-2">

                      <Avatar
                        name={ticket.assignedTo.name}
                        size="sm"
                      />

                      <span>
                        {ticket.assignedTo.name}
                      </span>

                    </div>

                  ) : (

                    <span
                      style={{
                        color: 'var(--text-muted)'
                      }}
                    >
                      Unassigned
                    </span>

                  )}

                </div>

              </div>

            )}

            {activeTab === 'replies' && (

              <div className="flex flex-col gap-4">

                {ticket.replies?.length ? (

                  ticket.replies.map(reply => (

                    <div
                      key={reply.id}
                      className="border rounded-lg p-4"
                    >

                      <div className="flex items-center gap-2 mb-2">

                        <Avatar
                          name={reply.author?.name}
                          size="xs"
                        />

                        <span className="font-medium">
                          {reply.author?.name}
                        </span>

                      </div>

                      <p>
                        {reply.message}
                      </p>

                      <small
                        style={{
                          color: 'var(--text-muted)'
                        }}
                      >
                        {formatDate(reply.createdAt)}
                      </small>

                    </div>

                  ))

                ) : (

                  <div
                    className="text-center py-10"
                    style={{
                      color: 'var(--text-muted)'
                    }}
                  >
                    No replies yet
                  </div>

                )}

              </div>

            )}

          </div>

        </div>

        <div className="card w-full lg:w-64 p-5 self-start">

          <h3 className="font-semibold mb-4">
            Ticket Information
          </h3>

          <div className="space-y-3">

            <div>

              <small>Status</small>

              <div>
                <Badge
                  variant={classifyStatus(ticket.status)}
                >
                  {ticket.status}
                </Badge>
              </div>

            </div>

            <div>

              <small>Created</small>

              <p>
                {formatDate(ticket.createdAt)}
              </p>

            </div>

            <div>

              <small>Updated</small>

              <p>
                {formatDate(ticket.updatedAt)}
              </p>

            </div>

            <div>

              <small>Resolved</small>

              <p>
                {ticket.resolvedAt
                  ? formatDate(ticket.resolvedAt)
                  : 'Not Resolved'}
              </p>

            </div>

            <div>

              <small>Closed</small>

              <p>
                {ticket.closedAt
                  ? formatDate(ticket.closedAt)
                  : 'Not Closed'}
              </p>

            </div>

          </div>

        </div>

      </div>

    </div>
  )
}
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckSquare, Square } from 'lucide-react'
import { projectsAPI } from '@/api/projects.api'
import { Tabs } from '@/components/ui/Tabs'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import { formatDate, formatCurrency, classifyStatus } from '@/lib/utils'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('overview')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsAPI.getById(id).then(r => r.data),
  })

  const { data: tasksData } = useQuery({
    queryKey: ['project-tasks', id],
    queryFn: () => projectsAPI.getTasks(id).then(r => r.data),
    enabled: activeTab === 'tasks',
  })

  const { data: membersData } = useQuery({
    queryKey: ['project-members', id],
    queryFn: () => projectsAPI.getMembers(id).then(r => r.data),
    enabled: activeTab === 'members',
  })

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }) => projectsAPI.updateTask(id, taskId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-tasks', id] }),
  })

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-[var(--border)] animate-pulse" />)}
      </div>
    )
  }

  if (!project) return null

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'tasks', label: 'Tasks', count: tasksData?.total },
    { key: 'members', label: 'Members' },
  ]

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/projects')} className="btn btn-ghost btn-icon">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>{project.name}</h1>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{project.client || 'Internal'}</p>
          </div>
          <Badge variant={classifyStatus(project.status || 'active')} dot>{project.status || 'active'}</Badge>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/projects/${id}/edit`)}>Edit</button>
      </div>

      <div className="p-6 flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 card overflow-hidden">
          <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
          <div className="p-5">
            {activeTab === 'overview' && (
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Description</p>
                  <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{project.description || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Budget</p>
                  <p className="text-[13px] font-bold" style={{ color: 'var(--primary)' }}>{project.budget ? formatCurrency(project.budget) : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Start Date</p>
                  <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{formatDate(project.startDate)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>End Date</p>
                  <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{formatDate(project.endDate)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Progress</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-[var(--border)]">
                      <div className="h-full rounded-full bg-[var(--primary)] transition-all" style={{ width: `${project.progress || 0}%` }} />
                    </div>
                    <span className="text-[13px] font-bold" style={{ color: 'var(--primary)' }}>{project.progress || 0}%</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="flex flex-col gap-2">
                {tasksData?.tasks?.length ? tasksData.tasks.map((task) => (
                  <div key={task._id} className="flex items-start gap-3 p-3 rounded-xl border hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <button
                      onClick={() => updateTaskMutation.mutate({ taskId: task._id, data: { completed: !task.completed } })}
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: task.completed ? 'var(--success)' : 'var(--text-muted)' }}
                    >
                      {task.completed ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium ${task.completed ? 'line-through' : ''}`} style={{ color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                        {task.title}
                      </p>
                      {task.assignedTo && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Avatar name={task.assignedTo.name} size="xs" />
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{task.assignedTo.name}</span>
                        </div>
                      )}
                    </div>
                    {task.dueDate && <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{formatDate(task.dueDate)}</span>}
                  </div>
                )) : (
                  <div className="py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>No tasks yet</div>
                )}
              </div>
            )}

            {activeTab === 'members' && (
              <div className="flex flex-col gap-2">
                {membersData?.members?.length ? membersData.members.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <Avatar name={m.user?.name || m.name} size="md" />
                    <div className="flex-1">
                      <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{m.user?.name || m.name}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{m.role || 'Member'}</p>
                    </div>
                    <Badge variant="gray">{m.role || 'Member'}</Badge>
                  </div>
                )) : (
                  <div className="py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>No members assigned</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-64 card p-4 self-start">
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>Project Info</p>
          <dl className="flex flex-col gap-3">
            <div>
              <dt className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Status</dt>
              <dd className="mt-0.5"><Badge variant={classifyStatus(project.status || 'active')} dot>{project.status || 'active'}</Badge></dd>
            </div>
            <div>
              <dt className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Client</dt>
              <dd className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{project.client || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Budget</dt>
              <dd className="text-[13px] font-bold" style={{ color: 'var(--primary)' }}>{project.budget ? formatCurrency(project.budget) : '—'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
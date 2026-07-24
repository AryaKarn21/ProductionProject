import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Clock, Building2, ToggleLeft, ToggleRight } from 'lucide-react'
import { shiftsAPI } from '@/api/shifts.api'
import { useAuthStore } from '@/store/auth.store'
import FormModal from '@/components/shared/FormModal'
import Badge from '@/components/ui/Badge'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

// Formats a TIME string (HH:mm:ss or HH:mm) into a 12-hour display
function fmt12(t) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// How many hours does the shift span (handles overnight shifts)?
function shiftHours(start, end) {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins <= 0) mins += 24 * 60 // overnight
  return (mins / 60).toFixed(1)
}

export default function ShiftsPage() {
  const queryClient = useQueryClient()
  const { user, activeCompany, companies } = useAuthStore()

  // Resolve the display name of the currently active company
  const companyName =
    (Array.isArray(companies) && companies.find((c) => c.id === activeCompany)?.name) ||
    user?.companyName ||
    'Your Company'

  const [modalOpen, setModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { name: '', startTime: '', endTime: '', description: '' },
  })

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => shiftsAPI.getAll().then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shifts'] })

  const createMutation = useMutation({
    mutationFn: (d) => shiftsAPI.create(d),
    onSuccess: () => { invalidate(); closeModal(); toast.success('Shift created') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to create shift'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => shiftsAPI.update(id, data),
    onSuccess: () => { invalidate(); closeModal(); toast.success('Shift updated') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to update shift'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) => shiftsAPI.update(id, { isActive }),
    onSuccess: (_res, { isActive }) => { invalidate(); toast.success(isActive ? 'Shift activated' : 'Shift deactivated') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => shiftsAPI.delete(id),
    onSuccess: () => { invalidate(); toast.success('Shift deleted') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to delete shift'),
  })

  const openCreate = () => {
    setEditingShift(null)
    reset({ name: '', startTime: '', endTime: '', description: '' })
    setModalOpen(true)
  }

  const openEdit = (shift) => {
    setEditingShift(shift)
    reset({
      name: shift.name,
      startTime: shift.startTime?.slice(0, 5) || '',
      endTime: shift.endTime?.slice(0, 5) || '',
      description: shift.description || '',
    })
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditingShift(null) }

  const onSubmit = (data) => {
    if (editingShift) updateMutation.mutate({ id: editingShift.id, data })
    else createMutation.mutate(data)
  }

  const activeShifts = shifts.filter((s) => s.isActive !== false)
  const inactiveShifts = shifts.filter((s) => s.isActive === false)

  return (
    <div className="animate-fade-in">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Shifts
            </h1>
            <span
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
            >
              <Building2 size={11} />
              {companyName}
            </span>
          </div>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {shifts.length} shift{shifts.length !== 1 ? 's' : ''} · {activeShifts.length} active
          </p>
        </div>
        <button className="btn btn-primary flex items-center gap-2" onClick={openCreate}>
          <Plus size={14} /> Add Shift
        </button>
      </div>

      {/* ── KPI Bar ── */}
      <div className="mx-4 sm:mx-6 mt-1 mb-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Total Shifts', value: shifts.length, color: 'var(--primary)' },
          { label: 'Active', value: activeShifts.length, color: '#22c55e' },
          { label: 'Inactive', value: inactiveShifts.length, color: 'var(--text-muted)' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="card px-4 py-3 flex flex-col gap-1"
          >
            <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              {kpi.label}
            </p>
            <p className="text-[22px] font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Shifts Grid ── */}
      <div className="mx-4 sm:mx-6 mb-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card h-36 animate-pulse" style={{ background: 'var(--surface-2)' }} />
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <div className="card flex flex-col items-center justify-center text-center py-16 gap-3">
            <Clock size={32} style={{ color: 'var(--text-muted)' }} />
            <div>
              <p className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                No shifts yet
              </p>
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Create your first shift to assign it to employees and attendance records.
              </p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              <Plus size={13} /> Add Shift
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shifts.map((shift) => {
              const hours = shiftHours(shift.startTime, shift.endTime)
              const isActive = shift.isActive !== false
              return (
                <div
                  key={shift.id}
                  className="card p-4 flex flex-col gap-3 transition-shadow hover:shadow-md"
                  style={{ borderLeft: `3px solid ${isActive ? 'var(--primary, #6366f1)' : 'var(--border)'}` }}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {shift.name}
                      </p>
                      {shift.description && (
                        <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {shift.description}
                        </p>
                      )}
                    </div>
                    <Badge variant={isActive ? 'success' : 'gray'} dot>
                      {isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {/* Time info */}
                  <div
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-[12px]"
                    style={{ background: 'var(--surface-2)' }}
                  >
                    <Clock size={14} style={{ color: 'var(--primary, #6366f1)' }} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {fmt12(shift.startTime)}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {fmt12(shift.endTime)}
                    </span>
                    {hours && (
                      <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>
                        {hours}h
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-1"
                      onClick={() => openEdit(shift)}
                      title="Edit"
                    >
                      <Pencil size={12} /> Edit
                    </button>

                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-1"
                      style={{ color: isActive ? 'var(--text-muted)' : 'var(--success, #22c55e)' }}
                      onClick={() => toggleMutation.mutate({ id: shift.id, isActive: !isActive })}
                      title={isActive ? 'Deactivate' : 'Activate'}
                    >
                      {isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                      {isActive ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-1 ml-auto"
                      style={{ color: 'var(--danger, #ef4444)' }}
                      onClick={() => {
                        if (window.confirm(`Delete "${shift.name}"? This cannot be undone.`)) {
                          deleteMutation.mutate(shift.id)
                        }
                      }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      <FormModal
        open={modalOpen}
        onClose={closeModal}
        title={editingShift ? 'Edit Shift' : 'Add Shift'}
        onSubmit={handleSubmit(onSubmit)}
        loading={createMutation.isPending || updateMutation.isPending}
        submitLabel={editingShift ? 'Save Changes' : 'Create Shift'}
      >
        <div className="flex flex-col gap-4">
          {/* Company badge inside modal so the user knows which company they're creating for */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            <Building2 size={13} />
            <span>
              Creating shift for <strong style={{ color: 'var(--text-primary)' }}>{companyName}</strong>
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Shift Name *</label>
            <input
              className="input"
              placeholder="e.g. Morning, Night, General"
              {...register('name', { required: 'Shift name is required' })}
            />
            {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Start Time *</label>
              <input
                type="time"
                className="input"
                {...register('startTime', { required: 'Start time is required' })}
              />
              {errors.startTime && <p className="text-[11px] text-red-500 mt-1">{errors.startTime.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">End Time *</label>
              <input
                type="time"
                className="input"
                {...register('endTime', { required: 'End time is required' })}
              />
              {errors.endTime && <p className="text-[11px] text-red-500 mt-1">{errors.endTime.message}</p>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Optional notes about this shift..."
              {...register('description')}
            />
          </div>
        </div>
      </FormModal>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'

import { projectsAPI } from '@/api/projects.api'
import { projectSchema } from '@/lib/validations'

// ─── Notification Banner ──────────────────────────────────────
function Notification({ type, title, message, onClose }) {
  const styles = {
    success: {
      wrap: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50',
      icon: <CheckCircle size={17} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />,
      title: 'text-emerald-800 dark:text-emerald-300',
      msg:   'text-emerald-600 dark:text-emerald-400',
      close: 'text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300',
    },
    error: {
      wrap: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50',
      icon: <XCircle size={17} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />,
      title: 'text-red-800 dark:text-red-300',
      msg:   'text-red-600 dark:text-red-400',
      close: 'text-red-400 hover:text-red-600 dark:hover:text-red-300',
    },
    warning: {
      wrap: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50',
      icon: <AlertCircle size={17} className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />,
      title: 'text-amber-800 dark:text-amber-300',
      msg:   'text-amber-600 dark:text-amber-400',
      close: 'text-amber-400 hover:text-amber-600 dark:hover:text-amber-300',
    },
  }
  const s = styles[type] || styles.success
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${s.wrap} mb-4 animate-fade-in`}>
      {s.icon}
      <div className="flex-1 min-w-0">
        {title   && <p className={`text-[13px] font-semibold ${s.title}`}>{title}</p>}
        {message && <p className={`text-[12px] mt-0.5 ${s.msg}`}>{message}</p>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className={`${s.close} transition-colors shrink-0`}>
          <X size={15} />
        </button>
      )}
    </div>
  )
}

// ─── Confirm Discard Dialog ───────────────────────────────────
function ConfirmDialog({ open, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <AlertCircle size={20} className="text-amber-500 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100">Discard changes?</h3>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">Any unsaved edits will be lost.</p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all"
          >
            Keep Editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-md shadow-amber-200 dark:shadow-amber-900/30"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
export default function ProjectEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [notification, setNotification] = useState(null)
  const [showConfirm, setShowConfirm]   = useState(false)

  const showNotif = (type, title, message, autoDismiss = true) => {
    setNotification({ type, title, message })
    if (autoDismiss) setTimeout(() => setNotification(null), 4000)
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(projectSchema),
  })

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsAPI.getById(id).then(res => res.data),
  })

  useEffect(() => {
    if (project) {
      reset({
        name:        project.name,
        description: project.description,
        client:      project.client,
        startDate:   project.startDate?.split('T')[0],
        endDate:     project.endDate?.split('T')[0],
        budget:      project.budget,
        progress:    project.progress,
      })
    }
  }, [project, reset])

  const updateMutation = useMutation({
    mutationFn: (data) => projectsAPI.update(id, data),

    onSuccess: () => {
      toast.success('Project updated successfully')
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', id] })
      navigate(`/projects/${id}`)
    },

    onError: (err) => {
      const message = err?.response?.data?.message || 'Failed to update project'
      showNotif('error', 'Update Failed', message, false)
      toast.error(message)
    },
  })

  const handleCancel = () => {
    if (isDirty) {
      setShowConfirm(true)
    } else {
      navigate(`/projects/${id}`)
    }
  }

  const onSubmit = (data) => {
    setNotification(null)
    updateMutation.mutate(data)
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-400 dark:text-slate-500">
        <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        Loading project…
      </div>
    )
  }

  return (
    <div className="animate-fade-in">

      {/* Confirm Discard Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onConfirm={() => { setShowConfirm(false); navigate(`/projects/${id}`) }}
        onCancel={() => setShowConfirm(false)}
      />

      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-icon" onClick={handleCancel}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-[18px] font-bold">Edit Project</h1>
            <p className="text-[12px] text-gray-500">Update project details</p>
          </div>
        </div>
      </div>

      <div className="card p-6 mx-6">

        {/* Notification Banner */}
        {notification && (
          <Notification
            type={notification.type}
            title={notification.title}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}

        <form
          className="flex flex-col gap-5"
          onSubmit={handleSubmit(onSubmit)}
        >

          <div className="form-group">
            <label className="form-label">Project Name</label>
            <input className="input" {...register('name')} />
            {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea rows={4} className="input" {...register('description')} />
          </div>

          <div className="form-group">
            <label className="form-label">Client</label>
            <input className="input" {...register('client')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input type="date" className="input" {...register('startDate')} />
              {errors.startDate && <p className="text-red-500 text-xs">{errors.startDate.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">End Date</label>
              <input type="date" className="input" {...register('endDate')} />
              {errors.endDate && <p className="text-red-500 text-xs">{errors.endDate.message}</p>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Budget</label>
            <input type="number" className="input" {...register('budget')} />
          </div>

          <div className="form-group">
            <label className="form-label">Progress (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              className="input"
              {...register('progress', { valueAsNumber: true })}
            />
            {errors.progress && <p className="text-red-500 text-xs">{errors.progress.message}</p>}
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Updating…' : 'Update Project'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
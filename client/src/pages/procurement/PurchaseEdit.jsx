import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { Plus, Trash2, ArrowLeft, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'

import { procurementAPI } from '@/api/procurement.api'
import { formatCurrency } from '@/lib/utils'

// ─── Inline Notification Banner ──────────────────────────────
function Notification({ type, title, message, onClose }) {
  const styles = {
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50',
      icon: <CheckCircle size={18} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />,
      title: 'text-emerald-800 dark:text-emerald-300',
      msg: 'text-emerald-600 dark:text-emerald-400',
      close: 'text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50',
      icon: <XCircle size={18} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />,
      title: 'text-red-800 dark:text-red-300',
      msg: 'text-red-600 dark:text-red-400',
      close: 'text-red-400 hover:text-red-600 dark:hover:text-red-300',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50',
      icon: <AlertCircle size={18} className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />,
      title: 'text-amber-800 dark:text-amber-300',
      msg: 'text-amber-600 dark:text-amber-400',
      close: 'text-amber-400 hover:text-amber-600 dark:hover:text-amber-300',
    },
  }

  const s = styles[type] || styles.success

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${s.bg} mb-4 animate-fade-in`}>
      {s.icon}
      <div className="flex-1 min-w-0">
        {title && <p className={`text-[13px] font-semibold ${s.title}`}>{title}</p>}
        {message && <p className={`text-[12px] mt-0.5 ${s.msg}`}>{message}</p>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className={`${s.close} transition-colors shrink-0`}>
          <X size={16} />
        </button>
      )}
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────
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
export default function PurchaseEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Notification state
  const [notification, setNotification] = useState(null)
  // Confirm-discard dialog
  const [showConfirm, setShowConfirm] = useState(false)

  const showNotif = (type, title, message, autoDismiss = true) => {
    setNotification({ type, title, message })
    if (autoDismiss) {
      setTimeout(() => setNotification(null), 4000)
    }
  }

  // ── Load Purchase Order ──────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => procurementAPI.getPurchaseOrder(id).then(res => res.data),
  })

  // ── Load Vendors ─────────────────────────────────────────────
  const { data: vendorData } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => procurementAPI.getVendors().then(res => res.data),
  })
  const vendors = vendorData?.vendors || []

  // ── Form ─────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    defaultValues: {
      vendorId: '',
      expectedDelivery: '',
      notes: '',
      items: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')

  const totalAmount =
    watchedItems?.reduce((sum, item) => {
      return sum + Number(item.quantity || 0) * Number(item.unitPrice || 0)
    }, 0) || 0

  // ── Populate Form ─────────────────────────────────────────────
  useEffect(() => {
    if (!data) return
    reset({
      vendorId: data.vendorId,
      expectedDelivery: data.expectedDelivery?.substring(0, 10) || '',
      notes: data.notes || '',
      items:
        data.items?.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })) || [],
    })
  }, [data, reset])

  // ── Mutation ─────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: formData => {
      const payload = {
        ...formData,
        totalAmount,
        items: formData.items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          total: Number(item.quantity) * Number(item.unitPrice),
        })),
      }
      return procurementAPI.updatePO(id, payload)
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
      toast.success('Purchase Order Updated')
      // ✅ Fixed: navigate to the correct details page, not the broken /procurement/orders
      navigate(`/procurement/orders/${id}`)
    },

    onError: err => {
      const message = err?.response?.data?.message || 'Failed to update Purchase Order'
      showNotif('error', 'Update Failed', message, false)
      toast.error(message)
    },
  })

  // ── Cancel handler ────────────────────────────────────────────
  const handleCancel = () => {
    if (isDirty) {
      // Has unsaved changes — show confirm dialog
      setShowConfirm(true)
    } else {
      // No changes — go straight back to details
      navigate(`/procurement/orders/${id}`)
    }
  }

  // ── Submit handler ────────────────────────────────────────────
  const onSubmit = formData => {
    if (formData.items.length === 0) {
      showNotif('warning', 'No Items', 'Add at least one purchase item before saving.', false)
      return
    }
    setNotification(null)
    updateMutation.mutate(formData)
  }

  // ── Loading ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-400 dark:text-slate-500">
        <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        Loading Purchase Order…
      </div>
    )
  }

  return (
    <div className="animate-fade-in">

      {/* ── Confirm Discard Dialog ── */}
      <ConfirmDialog
        open={showConfirm}
        onConfirm={() => {
          setShowConfirm(false)
          navigate(`/procurement/orders/${id}`)
        }}
        onCancel={() => setShowConfirm(false)}
      />

      {/* ── Header ── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleCancel}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Edit Purchase Order
            </h1>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {data?.poNumber}
            </p>
          </div>
        </div>
      </div>

      <form
        className="card mx-6 p-6 flex flex-col gap-6"
        onSubmit={handleSubmit(onSubmit)}
      >

        {/* ── Inline Notification ── */}
        {notification && (
          <Notification
            type={notification.type}
            title={notification.title}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}

        {/* ── Update Success Banner (shown after invalidation before navigate) ── */}
        {updateMutation.isSuccess && (
          <Notification
            type="success"
            title="Purchase Order Updated"
            message="Your changes have been saved. Redirecting…"
          />
        )}

        {/* ── Vendor + Delivery ── */}
        <div className="grid grid-cols-2 gap-5">

          <div className="form-group">
            <label className="form-label">Vendor</label>
            <select
              className="input"
              {...register('vendorId', { required: 'Vendor is required' })}
            >
              <option value="">Select Vendor</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            {errors.vendorId && (
              <p className="text-red-500 text-xs mt-1">{errors.vendorId.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Expected Delivery</label>
            <input
              type="date"
              className="input"
              {...register('expectedDelivery')}
            />
          </div>

        </div>

        {/* ── Items ── */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Purchase Items</h3>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => append({ name: '', quantity: 1, unitPrice: 0 })}
            >
              <Plus size={14} />
              Add Item
            </button>
          </div>

          {fields.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-400 dark:text-slate-500">
              No items yet — click <strong>Add Item</strong> to begin.
            </div>
          )}

          <div className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-12 gap-3 items-center">

                <input
                  className="input col-span-5"
                  placeholder="Item Name"
                  {...register(`items.${index}.name`, { required: true })}
                />

                <input
                  type="number"
                  className="input col-span-2"
                  placeholder="Qty"
                  min={1}
                  {...register(`items.${index}.quantity`, { required: true, min: 1 })}
                />

                <input
                  type="number"
                  className="input col-span-2"
                  placeholder="Price"
                  min={0}
                  step="0.01"
                  {...register(`items.${index}.unitPrice`, { required: true, min: 0 })}
                />

                <div className="col-span-2 font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(
                    (Number(watchedItems?.[index]?.quantity) || 0) *
                    (Number(watchedItems?.[index]?.unitPrice) || 0)
                  )}
                </div>

                <button
                  type="button"
                  className="text-red-400 hover:text-red-600 transition-colors"
                  onClick={() => remove(index)}
                >
                  <Trash2 size={16} />
                </button>

              </div>
            ))}
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea rows={4} className="input" {...register('notes')} />
        </div>

        {/* ── Total ── */}
        <div className="flex justify-end border-t pt-5">
          <div className="text-right">
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Total Amount</div>
            <div className="text-xl font-bold">{formatCurrency(totalAmount)}</div>
          </div>
        </div>

        {/* ── Footer Buttons ── */}
        <div className="flex justify-end gap-3">

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>

          <button
            className="btn btn-primary"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Updating…' : 'Update Purchase Order'}
          </button>

        </div>

      </form>
    </div>
  )
}
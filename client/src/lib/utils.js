import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'

// Tailwind class merger
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Format currency for Nepal (NPR) by default
export function formatCurrency(amount, currency = 'NPR') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
} 

// Safely format relative time (e.g., "3 days ago") without crashing
export function formatRelativeTime(dateValue) {
  if (!dateValue) return '—'
  
  const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue)
  if (!isValid(date)) return '—'
  
  return formatDistanceToNow(date, { addSuffix: true })
}

// NEW: Safely format standard dates (e.g., "Jan 1, 2026")
export function formatDate(dateValue, formatStr = 'PPP') {
  if (!dateValue) return '—'
  
  const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue)
  if (!isValid(date)) return '—'
  
  return format(date, formatStr)
}

// Resolves a relative path like "/uploads/avatars/xxx.png" (returned by
// your API) into a full URL pointing at the API server, since the API and
// the frontend live on different domains in production.
function getApiOrigin() {
  const apiUrl = import.meta.env.VITE_API_URL || ''
  try {
    return new URL(apiUrl, window.location.origin).origin
  } catch {
    return ''
  }
}

export function getFileUrl(path) {
  if (!path) return path
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path // already a full URL, leave it alone
  }
  const origin = getApiOrigin()
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`
}

// Get user initials for avatars
export function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// Truncate long text strings
export function truncate(str, length = 40) {
  if (!str) return ''
  return str.length > length ? str.slice(0, length) + '...' : str
}

// Map database statuses to UI component color intents
export function classifyStatus(status) {
  const map = {
    active: 'success', open: 'info', closed: 'gray', won: 'success',
    lost: 'danger', pending: 'warning', approved: 'success',
    rejected: 'danger', new: 'info', inprogress: 'warning',
    on_leave: 'warning', inactive: 'gray', terminated: 'danger',
    suspended: 'danger', half_day: 'warning', present: 'success',
    absent: 'danger', late: 'warning', draft: 'gray', paid: 'success',
    holiday: 'info',
    unpaid: 'danger', probation: 'info',
  }
  return map[status?.toLowerCase()] || 'gray'
}

// Turn snake_case / camelCase status values into readable labels ("on_leave" -> "On Leave")
export function formatStatusLabel(status) {
  if (!status) return '—'
  return String(status)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
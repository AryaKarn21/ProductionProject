import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function StatCard({ title, value, change, changeLabel, icon: Icon, color = 'primary', loading = false }) {
  const colorMap = {
    primary: { bg: 'var(--primary-light)', icon: 'var(--primary)' },
    success: { bg: 'var(--success-bg)', icon: 'var(--success)' },
    warning: { bg: 'var(--warning-bg)', icon: 'var(--warning)' },
    danger:  { bg: 'var(--danger-bg)',  icon: 'var(--danger)'  },
    info:    { bg: 'var(--info-bg)',    icon: 'var(--info)'    },
    gray:    { bg: 'var(--surface-2)', icon: 'var(--text-muted)' },
  }
  const colors = colorMap[color] || colorMap.gray

  return (
    <div className="stat-card flex flex-col justify-between min-h-[110px]">
      {/* ── top row: title + icon ── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p
          className="text-[11px] font-semibold uppercase tracking-wide leading-tight"
          style={{ color: 'var(--text-muted)' }}
        >
          {title}
        </p>

        {/* icon badge — shrink-0 so it never gets squeezed */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: colors.bg }}
        >
          {Icon && <Icon size={17} style={{ color: colors.icon }} />}
        </div>
      </div>

      {/* ── value ── */}
      {loading ? (
        <div
          className="h-7 w-20 rounded animate-pulse mt-1"
          style={{ background: 'var(--border)' }}
        />
      ) : (
        <p
          className="stat-card-value font-bold leading-tight break-words min-w-0"
          style={{ color: 'var(--text-primary)' }}
        >
          {value}
        </p>
      )}

      {/* ── optional change badge ── */}
      {change !== undefined && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {change >= 0
            ? <TrendingUp size={12} className="text-green-500 flex-shrink-0" />
            : <TrendingDown size={12} className="text-red-500 flex-shrink-0" />
          }
          <span className={cn('text-[11px] font-semibold', change >= 0 ? 'text-green-600' : 'text-red-600')}>
            {change >= 0 ? '+' : ''}{change}%
          </span>
          {changeLabel && (
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {changeLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
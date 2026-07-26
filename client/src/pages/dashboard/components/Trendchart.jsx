import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Activity } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12px]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
    >
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="dash-legend-dot" style={{ background: p.color }} />
          <span style={{ color: 'var(--text-secondary)' }}>
            {p.dataKey === 'leads' ? 'New leads' : 'Revenue won'}:
          </span>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {p.dataKey === 'revenue' ? formatCurrency(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function TrendChart({ data = [], loading }) {
  return (
    <div className="dash-card overflow-hidden">
      <div className="dash-card-head">
        <div className="flex items-center gap-2">
          <Activity size={15} style={{ color: 'var(--primary)' }} />
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Leads &amp; Revenue Trend</h3>
        </div>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="dash-legend-dot" style={{ background: 'var(--primary)' }} /> Leads
          </span>
          <span className="flex items-center gap-1.5">
            <span className="dash-legend-dot" style={{ background: 'var(--success)' }} /> Revenue
          </span>
        </div>
      </div>
      <div className="p-4" style={{ height: 300 }}>
        {loading ? (
          <div className="dash-skeleton w-full h-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%" debounce={100}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dashLeadsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dashRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis yAxisId="leads" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
              <YAxis yAxisId="revenue" orientation="right" hide />
              <Tooltip content={<CustomTooltip />} />
              <Area yAxisId="leads" type="monotone" dataKey="leads" stroke="var(--primary)" strokeWidth={2} fill="url(#dashLeadsGradient)" animationDuration={600} />
              <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke="var(--success)" strokeWidth={2} fill="url(#dashRevenueGradient)" animationDuration={600} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
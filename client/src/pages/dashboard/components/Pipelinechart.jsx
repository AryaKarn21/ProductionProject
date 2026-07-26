import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import { PieChart as PieIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const BAR_COLORS = ['var(--primary)', 'var(--info)', 'var(--success)', 'var(--warning)', 'var(--danger)', '#8b5cf6', '#06b6d4', '#ec4899']

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12px]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
    >
      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.payload.stage}</p>
      <p style={{ color: 'var(--text-secondary)' }}>{formatCurrency(p.value)} · {p.payload.percent}%</p>
    </div>
  )
}

function truncateLabel(value) {
  return value.length > 14 ? `${value.slice(0, 13)}…` : value
}

export default function PipelineChart({ data = [], loading }) {
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, 6)
  const total = sorted.reduce((sum, d) => sum + (d.value || 0), 0)
  const chartData = sorted.map((d) => ({
    ...d,
    percent: total ? Math.round((d.value / total) * 100) : 0,
  }))

  // Scale the plot area to the number of stages so 1-2 bars don't drown in
  // dead space, while still capping the height on wide pipelines.
  const plotHeight = Math.min(320, Math.max(140, chartData.length * 46))

  return (
    <div className="dash-card overflow-hidden">
      <div className="dash-card-head">
        <div className="flex items-center gap-2">
          <PieIcon size={15} style={{ color: 'var(--primary)' }} />
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Pipeline by Stage</h3>
        </div>
        {!loading && total > 0 && (
          <span
            className="text-[11px] font-semibold px-2 py-1 rounded-full"
            style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
          >
            {formatCurrency(total)} open
          </span>
        )}
      </div>
      <div className="p-4 flex items-center" style={{ minHeight: 220 }}>
        {loading ? (
          <div className="dash-skeleton w-full" style={{ height: 220 }} />
        ) : chartData.length ? (
          <div style={{ width: '100%', height: plotHeight }}>
            <ResponsiveContainer width="100%" height="100%" debounce={100}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tickFormatter={truncateLabel}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                  width={88}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} animationDuration={600}>
                  {chartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                  <LabelList
                    dataKey="percent"
                    position="right"
                    formatter={(v) => `${v}%`}
                    style={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-muted)' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center gap-1.5 text-center" style={{ height: 220 }}>
            <PieIcon size={22} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No open pipeline yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
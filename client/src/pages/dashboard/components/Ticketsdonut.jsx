import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { LifeBuoy } from 'lucide-react'

const STATUS_COLORS = {
  Open: 'var(--info)',
  'In Progress': 'var(--warning)',
  Pending: '#8b5cf6',
  Resolved: 'var(--success)',
  Closed: 'var(--text-muted)',
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12px]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
    >
      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
      <p style={{ color: 'var(--text-secondary)' }}>{p.value} tickets</p>
    </div>
  )
}

export default function TicketsDonut({ data = [], loading }) {
  const total = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="dash-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <LifeBuoy size={15} style={{ color: 'var(--primary)' }} />
        <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Tickets by Status</h3>
      </div>

      {loading ? (
        <div className="dash-skeleton w-full" style={{ height: 160 }} />
      ) : total === 0 ? (
        <div className="flex items-center justify-center text-[13px] py-10" style={{ color: 'var(--text-muted)' }}>
          No tickets yet
        </div>
      ) : (
        <>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%" debounce={100}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={42}
                  outerRadius={64}
                  paddingAngle={3}
                  animationDuration={600}
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={STATUS_COLORS[d.status] || 'var(--text-muted)'} stroke="var(--surface)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 mt-2">
            {data.map((d) => (
              <div key={d.status} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <span className="dash-legend-dot" style={{ background: STATUS_COLORS[d.status] || 'var(--text-muted)' }} />
                  {d.status}
                </span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
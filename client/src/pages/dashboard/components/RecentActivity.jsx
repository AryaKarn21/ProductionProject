import { Clock } from 'lucide-react'

const AVATAR_PALETTE = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--info)', '#8b5cf6']

function avatarColor(seed) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

export default function RecentActivity({ items = [], loading }) {
  return (
    <div className="dash-card overflow-hidden h-full flex flex-col">
      <div className="dash-card-head">
        <div className="flex items-center gap-2">
          <Clock size={15} style={{ color: 'var(--primary)' }} />
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h3>
        </div>
      </div>

      <div className="dash-timeline flex-1 overflow-y-auto" style={{ maxHeight: 360 }}>
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="dash-skeleton rounded-full flex-shrink-0" style={{ width: 32, height: 32 }} />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="dash-skeleton h-3 w-3/4" />
                  <div className="dash-skeleton h-2.5 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length ? (
          items.map((item, i) => {
            const color = avatarColor(item.user || 'System')
            return (
              <div key={i} className="dash-timeline-item">
                <div className="dash-timeline-rail">
                  <div
                    className="dash-timeline-dot"
                    style={{ background: `color-mix(in srgb, ${color} 16%, var(--surface))`, color }}
                  >
                    {(item.user?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="dash-timeline-line" />
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <p className="text-[13px] leading-snug" style={{ color: 'var(--text-primary)' }}>{item.description}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{item.user} · {item.timeAgo}</p>
                </div>
              </div>
            )
          })
        ) : (
          <div className="px-5 py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
            No recent activity
          </div>
        )}
      </div>
    </div>
  )
}

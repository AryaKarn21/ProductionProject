import { cn } from '@/lib/utils'

export function Tabs({ tabs, activeTab, onChange }) {
  return (
    // overflow-x-auto => the strip scrolls instead of clipping the last tab.
    // no-scrollbar hides the native scrollbar track; the fade div on the
    // right edge is what actually signals "there are more tabs here" —
    // relying on a thin scrollbar alone is easy to miss.
    <div className="relative">
      <div
        className="flex items-center border-b overflow-x-auto no-scrollbar"
        style={{ borderColor: 'var(--border)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              // shrink-0 + whitespace-nowrap => labels never wrap to two lines
              // and buttons never get squeezed.
              'shrink-0 whitespace-nowrap px-4 py-3 text-[13px] font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.key
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent hover:text-[var(--text-primary)]'
            )}
            style={{ color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-muted)' }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'ml-2 px-1.5 py-0.5 text-[10px] rounded-full font-semibold',
                  activeTab === tab.key
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--border)] text-[var(--text-muted)]'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Fade hint: fixed width, pointer-events-none so it never blocks a
          click on the last tab underneath it. */}
      <div
        className="pointer-events-none absolute top-0 right-0 h-full w-8"
        style={{ background: 'linear-gradient(to right, transparent, var(--surface))' }}
      />
    </div>
  )
}
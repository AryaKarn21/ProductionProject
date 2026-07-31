/*
|--------------------------------------------------------------------------
| Leads cell — Group Console → Overview
|--------------------------------------------------------------------------
|
| The old cell showed "7 +7", which reads as if the lead were duplicated
| rather than as "7 total, 7 of them added this period" — genuinely
| ambiguous. This shows the total plus a colored stage breakdown
| (New / Contacted / Qualified / Proposal / Negotiation / Closed Won /
| Closed Lost) as a compact stacked bar, with the exact numbers in a
| hover/focus tooltip.
*/

// Ordered the way a lead actually moves through the pipeline, so both the
// bar and the tooltip read left-to-right as progress.
const STAGES = [
  { key: 'New', label: 'New', dot: 'bg-sky-400', text: 'text-sky-400' },
  { key: 'Contacted', label: 'Contacted', dot: 'bg-indigo-400', text: 'text-indigo-400' },
  { key: 'Qualified', label: 'Qualified', dot: 'bg-violet-400', text: 'text-violet-400' },
  { key: 'Proposal', label: 'Proposal', dot: 'bg-amber-400', text: 'text-amber-400' },
  { key: 'Negotiation', label: 'Negotiation', dot: 'bg-orange-400', text: 'text-orange-400' },
  { key: 'Closed Won', label: 'Closed Won', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  { key: 'Closed Lost', label: 'Closed Lost', dot: 'bg-rose-400', text: 'text-rose-400' },
]

export default function LeadsStageCell({ leadsByStage = {}, total = 0, newInPeriod = 0 }) {
  const present = STAGES.filter((s) => (leadsByStage[s.key] || 0) > 0)

  if (total === 0) {
    return <span className="text-slate-500">0</span>
  }

  return (
    <div className="group/leads relative inline-flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-slate-200 tabular-nums">{total}</span>
        {newInPeriod > 0 && (
          <span className="text-[10px] text-emerald-400">+{newInPeriod} new</span>
        )}
      </div>

      {/* Compact stacked bar — one segment per stage present, width
          proportional to its share of the total. */}
      {present.length > 0 && (
        <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
          {present.map((s) => (
            <div
              key={s.key}
              className={s.dot}
              style={{ width: `${((leadsByStage[s.key] || 0) / total) * 100}%` }}
            />
          ))}
        </div>
      )}

      {/* Tooltip — exact stage breakdown on hover/focus. */}
      <div
        tabIndex={0}
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 w-48 z-20 rounded-lg border border-slate-700 bg-slate-950 p-3 text-left opacity-0 shadow-xl transition-opacity duration-150 group-hover/leads:opacity-100 group-focus-within/leads:opacity-100 outline-none"
      >
        <p className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">
          Lead Stages
        </p>
        <dl className="space-y-1 text-[11px]">
          {present.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </dt>
              <dd className={`font-semibold tabular-nums ${s.text}`}>
                {leadsByStage[s.key]}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800">
            <dt className="text-slate-400">Total</dt>
            <dd className="font-semibold text-slate-200 tabular-nums">{total}</dd>
          </div>
          {newInPeriod > 0 && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">Added this period</dt>
              <dd className="font-semibold text-emerald-400 tabular-nums">+{newInPeriod}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}
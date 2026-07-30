import { cn } from "@/lib/utils"

const TONES = {
  default: "text-white",
  warn: "text-amber-400",
  danger: "text-rose-400",
  good: "text-emerald-400",
}

export default function GroupKpiCard({ label, value, sub, icon: Icon, tone = "default" }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </p>
        {Icon && <Icon size={14} className="text-slate-500 flex-shrink-0" />}
      </div>

      <p className={cn("text-xl font-bold mt-2 tabular-nums", TONES[tone] || TONES.default)}>
        {value}
      </p>

      {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

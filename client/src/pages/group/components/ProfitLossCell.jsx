import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

/*
|--------------------------------------------------------------------------
| Profit / Loss cell — Group Console → Overview
|--------------------------------------------------------------------------
|
| Revenue - Expenses for one company over the selected reporting period.
| Never derived from pipeline (that's potential future revenue, not
| money made or lost) — the value comes straight from the `pnl` object
| the /group/overview API already computed from posted ledger income and
| approved expenses.
|
| Three states:
|   - no financial data posted at all  -> "—", gray, no tooltip content
|   - profit (> 0)                     -> green, up arrow
|   - loss (< 0)                       -> red, down arrow
|   - break-even (exactly 0)           -> gray, dash
*/
export default function ProfitLossCell({ pnl, currency = 'NPR' }) {
  if (!pnl || !pnl.available) {
    return <span className="text-slate-500">—</span>
  }

  const { totalRevenue, totalExpenses, netProfitLoss } = pnl
  const isProfit = netProfitLoss > 0
  const isLoss = netProfitLoss < 0

  const tone = isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400'
  const Icon = isProfit ? ArrowUp : isLoss ? ArrowDown : Minus
  const sign = isProfit ? '+' : isLoss ? '-' : ''

  return (
    <div
      tabIndex={0}
      className="group/pnl relative inline-flex items-center justify-end outline-none"
    >
      <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${tone}`}>
        <Icon size={12} strokeWidth={2.5} />
        {sign} {formatCurrency(Math.abs(netProfitLoss), currency)}
      </span>

      {/* Tooltip — appears above the value on hover/focus. */}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 w-56 z-20 rounded-lg border border-slate-700 bg-slate-950 p-3 text-left opacity-0 shadow-xl transition-opacity duration-150 group-hover/pnl:opacity-100 group-focus-within/pnl:opacity-100"
      >
        <p className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">
          Financial Summary
        </p>
        <dl className="space-y-1 text-[11px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-400">Revenue</dt>
            <dd className="text-slate-200 tabular-nums">
              {formatCurrency(totalRevenue, currency)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-400">Expenses</dt>
            <dd className="text-slate-200 tabular-nums">
              {formatCurrency(totalExpenses, currency)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800">
            <dt className="text-slate-400">Net Profit/Loss</dt>
            <dd className={`font-semibold tabular-nums ${tone}`}>
              {sign} {formatCurrency(Math.abs(netProfitLoss), currency)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
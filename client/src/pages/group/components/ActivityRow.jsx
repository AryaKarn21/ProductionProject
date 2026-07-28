import { useState } from 'react'
import { ChevronDown, ChevronRight, Building2, Monitor } from 'lucide-react'
import { formatRelativeTime, formatDate, getInitials, cn } from '@/lib/utils'
import { parseAction, changedFields, moduleColor, verbColor } from '../activityLabels'

/*
| One row in the cross-company activity feed.
|
| Collapsed it answers who / what / where / when. Expanded it shows the
| actual field-level diff the audit hook captured, which is what makes
| this an oversight tool rather than just a log viewer — the parent
| company can see that a discount went from 5% to 40%, not merely that
| "an opportunity was updated".
*/
export default function ActivityRow({ log }) {
  const [open, setOpen] = useState(false)

  const { verb, noun } = parseAction(log)
  const fields = changedFields(log)
  const hasDetail = log.changes && Object.keys(log.changes).length > 0

  return (
    <div className="border-b border-slate-800/60 last:border-b-0">
      <button
        onClick={() => hasDetail && setOpen((o) => !o)}
        className={cn(
          'w-full text-left p-3.5 flex items-start gap-3 transition-colors',
          hasDetail && 'hover:bg-slate-800/30 cursor-pointer'
        )}
      >
        {/* Actor */}
        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-semibold text-slate-300 flex-shrink-0 mt-0.5">
          {getInitials(log.actor?.name || 'SY')}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-300 leading-relaxed">
            <span className="font-semibold text-slate-100">
              {log.actor?.name || 'System'}
            </span>{' '}
            <span className={verbColor(verb)}>{verb}</span>{' '}
            <span className="text-slate-400">{noun}</span>
            {log.resourceLabel && (
              <>
                {' — '}
                <span className="font-medium text-slate-200">{log.resourceLabel}</span>
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {/* Which child company — the whole point of this screen */}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/60 text-[10px] font-medium text-slate-300">
              <Building2 size={9} />
              {log.company?.name}
            </span>

            {log.module && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded border text-[10px] font-medium capitalize',
                  moduleColor(log.module)
                )}
              >
                {log.module}
              </span>
            )}

            {log.status === 'failed' && (
              <span className="px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-[10px] font-medium text-rose-400">
                failed
              </span>
            )}

            {fields.length > 0 && (
              <span className="text-[10px] text-slate-500">
                {fields.length} field{fields.length === 1 ? '' : 's'} changed
              </span>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-right flex-shrink-0 flex items-start gap-2">
          <div>
            <p className="text-[10px] text-slate-400" title={formatDate(log.createdAt, 'PPpp')}>
              {formatRelativeTime(log.createdAt)}
            </p>
            {log.device && (
              <p className="text-[10px] text-slate-600 flex items-center gap-1 justify-end mt-0.5">
                <Monitor size={9} />
                {log.device}
              </p>
            )}
          </div>
          {hasDetail &&
            (open ? (
              <ChevronDown size={13} className="text-slate-500 mt-0.5" />
            ) : (
              <ChevronRight size={13} className="text-slate-500 mt-0.5" />
            ))}
        </div>
      </button>

      {open && hasDetail && <ChangeDetail changes={log.changes} log={log} />}
    </div>
  )
}

/** The expanded field-level diff. */
function ChangeDetail({ changes, log }) {
  // Creates and deletes carry a whole-record snapshot; updates carry a
  // per-field { before, after } map. Render each in its own shape.
  const snapshot = changes.after || changes.before
  const isSnapshot = !!snapshot
  const label = changes.after ? 'Created with' : changes.before ? 'Deleted record' : null

  if (changes.bulk) {
    return (
      <div className="px-3.5 pb-3.5 pl-[54px]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-[11px] text-slate-400">
            Bulk operation on{' '}
            <span className="text-slate-200 font-medium">{log.resource}</span>
            {changes.fields?.length > 0 && (
              <> — fields: {changes.fields.join(', ')}</>
            )}
          </p>
        </div>
      </div>
    )
  }

  const entries = isSnapshot
    ? Object.entries(snapshot).filter(([, v]) => v !== null && v !== '')
    : Object.entries(changes)

  return (
    <div className="px-3.5 pb-3.5 pl-[54px]">
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
        {label && (
          <div className="px-3 py-2 border-b border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </div>
        )}

        <div className="divide-y divide-slate-800/60">
          {entries.slice(0, 25).map(([field, value]) => (
            <div key={field} className="px-3 py-2 grid grid-cols-3 gap-3 items-start">
              <span className="text-[11px] font-medium text-slate-400 break-words">
                {field}
              </span>

              {isSnapshot ? (
                <span className="col-span-2 text-[11px] text-slate-300 break-words">
                  {renderValue(value)}
                </span>
              ) : (
                <span className="col-span-2 text-[11px] break-words">
                  <span className="text-rose-400/80 line-through">
                    {renderValue(value?.before)}
                  </span>
                  <span className="text-slate-600 mx-1.5">→</span>
                  <span className="text-emerald-400">{renderValue(value?.after)}</span>
                </span>
              )}
            </div>
          ))}
        </div>

        {entries.length > 25 && (
          <div className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-800">
            +{entries.length - 25} more field(s) not shown
          </div>
        )}
      </div>
    </div>
  )
}

/** Renders any JSON value compactly, without ever printing "[object Object]". */
function renderValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    return json.length > 120 ? `${json.slice(0, 120)}…` : json
  }
  const str = String(value)
  return str.length > 120 ? `${str.slice(0, 120)}…` : str
}

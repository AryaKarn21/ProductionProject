/*
| Turns raw audit rows into something a director can read.
|
| The auto-audit hooks write machine-shaped actions ("lead_created",
| "purchaseorder_updated") because that is what is cheap and reliable to
| record. Presentation belongs here, on the client, so the stored data
| stays stable while the wording can change freely.
*/

/** 'lead_created' -> { verb: 'created', noun: 'Lead' } */
export function parseAction(log) {
  const action = log?.action || ''

  // Hand-written route entries already read well ("user_role_assigned").
  if (log?.source === 'route') {
    return { verb: action.replace(/_/g, ' '), noun: log.resource || '' }
  }

  const match = action.match(/^(.*?)_(created|updated|deleted|bulk_updated|bulk_deleted)$/)
  if (!match) return { verb: action.replace(/_/g, ' '), noun: log?.resource || '' }

  return {
    verb: match[2].replace(/_/g, ' '),
    noun: log?.resource || match[1],
  }
}

/** One line summarising the row: "Ramesh updated Lead — Acme Trading". */
export function describeActivity(log) {
  const { verb, noun } = parseAction(log)
  const who = log?.actor?.name || 'System'
  const what = log?.resourceLabel ? `${noun} — ${log.resourceLabel}` : noun
  return `${who} ${verb} ${what}`.trim()
}

/** The fields an update touched, for the collapsed row summary. */
export function changedFields(log) {
  const changes = log?.changes
  if (!changes || typeof changes !== 'object') return []

  // Creates and deletes store a whole snapshot under after/before rather
  // than a per-field diff, so there is no meaningful "changed" list.
  if (changes.after || changes.before || changes.bulk) return []

  return Object.keys(changes)
}

export const MODULE_COLORS = {
  crm: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  hr: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  finance: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  inventory: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  procurement: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  projects: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  support: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  calendar: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  settings: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
  security: 'text-red-400 bg-red-500/10 border-red-500/20',
  other: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
}

export const moduleColor = (module) => MODULE_COLORS[module] || MODULE_COLORS.other

export const VERB_COLORS = {
  created: 'text-emerald-400',
  updated: 'text-sky-400',
  deleted: 'text-rose-400',
}

export const verbColor = (verb) => VERB_COLORS[verb] || 'text-slate-300'

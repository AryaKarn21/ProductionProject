import { Network } from 'lucide-react'
import { Link } from 'react-router-dom'

/*
| Shown when the active company has no child companies.
|
| This is the state every account starts in: `companies.parentId` exists
| in the schema but nothing populates it until somebody assigns a parent.
| Rather than render six KPI cards full of zeroes and leave the user
| guessing, say exactly what is missing and link to where it is fixed.
*/
export default function GroupEmptyState({ rootName }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
        <Network size={22} className="text-slate-400" />
      </div>

      <h3 className="text-sm font-bold text-white">
        No child companies under {rootName || 'this company'} yet
      </h3>

      <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
        The Group Console shows what every company beneath this one is doing.
        To populate it, open a company in Settings and set its
        <span className="text-slate-200 font-medium"> parent company </span>
        to {rootName || 'this company'}.
      </p>

      <Link
        to="/settings"
        className="inline-flex items-center gap-1.5 mt-5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
      >
        Go to Company Settings
      </Link>
    </div>
  )
}

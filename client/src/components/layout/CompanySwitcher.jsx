import { ChevronDown, Check, Building2 } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

export default function CompanySwitcher() {
  const { companies, activeCompany, setActiveCompany } = useAuthStore()
  const [open, setOpen] = useState(false)
  const current = companies?.find(c => c.id === activeCompany)

  if (!companies?.length) return null

  return (
    <div className="px-2 py-2 border-b border-white/10">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/06 transition-colors text-left"
      >
        <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
          <Building2 size={12} className="text-white" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-[12px] font-medium text-white truncate">{current?.name || 'Select Company'}</p>
          <p className="text-[10px] text-[var(--sidebar-text)] truncate">{current?.type || 'Company'}</p>
        </div>
        <ChevronDown size={12} className="text-[var(--sidebar-text)] flex-shrink-0" />
      </button>

      {open && companies.length > 1 && (
        <div className="mt-1 rounded-lg overflow-hidden border border-white/10 animate-fade-in">
          {companies.map(company => (
            <button
              key={company.id}
              onClick={() => { setActiveCompany(company.id); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-white/06 transition-colors"
            >
              <Building2 size={12} className="text-[var(--sidebar-text)]" />
              {/*
                Was comparing against `company._id`. Every other line in
                this file — and the store — keys off `company.id`, so the
                selected company was never highlighted: the label stayed
                muted grey while the tick beside it was rendered.
              */}
              <span className={cn('flex-1 text-left truncate', activeCompany === company.id ? 'text-white' : 'text-[var(--sidebar-text)]')}>
                {company.name}
              </span>
              {activeCompany === company.id && <Check size={12} className="text-[var(--primary)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
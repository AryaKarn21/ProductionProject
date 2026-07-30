import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ total, page, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const pages = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <div className="flex items-center justify-between">
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => onChange(page - 1)} className="btn btn-ghost btn-sm btn-icon disabled:opacity-40">
          <ChevronLeft size={14} />
        </button>
        {pages.map((p, i) => (
          <button
            key={i}
            disabled={p === '...'}
            onClick={() => p !== '...' && onChange(p)}
            className="w-8 h-8 text-[12px] rounded-md transition-colors"
            style={{ background: p === page ? 'var(--primary)' : 'transparent', color: p === page ? 'white' : 'var(--text-secondary)' }}
          >{p}</button>
        ))}
        <button disabled={page === totalPages} onClick={() => onChange(page + 1)} className="btn btn-ghost btn-sm btn-icon disabled:opacity-40">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
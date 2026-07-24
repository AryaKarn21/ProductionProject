import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { 
  Play, 
  Plus, 
  DollarSign, 
  Users, 
  TrendingUp, 
  PieChart, 
  Eye, 
  CheckCircle, 
  AlertCircle,
  Building2,
  FileSpreadsheet
} from 'lucide-react'
import { payrollAPI } from '@/api/payroll.api'
import { useAuthStore } from '@/store/auth.store'
import DataTable from '@/components/shared/DataTable'
import FilterBar from '@/components/shared/FilterBar'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { formatDate, formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

const PAYROLL_STATUS_OPTIONS = [
  { label: 'Draft', value: 'draft' },
  { label: 'Processing', value: 'processing' },
  { label: 'Processed', value: 'processed' },
  { label: 'Approved', value: 'approved' },
  { label: 'Paid', value: 'paid' },
]

export default function PayrollRuns() {
  const queryClient = useQueryClient()
  const [params, setParams] = useState({ page: 1, limit: 20, search: '', status: '' })
  const [selectedRun, setSelectedRun] = useState(null)

  // Enterprise Context
  const { user, activeCompany, companies } = useAuthStore()
  const companyName =
    (Array.isArray(companies) && companies.find((c) => c.id === activeCompany)?.name) ||
    user?.companyName ||
    "OS Group of Companies"

  const { data, isLoading, error } = useQuery({
    queryKey: ['payroll', params],
    queryFn: () => payrollAPI.getRuns(params).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  const runPayrollMutation = useMutation({
    mutationFn: (id) => {
      if (id) return payrollAPI.runPayroll(id)
      const now = new Date()
      const period = `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`
      return payrollAPI.createRun({ period })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] })
      toast.success('Payroll run initiated successfully')
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to initiate payroll run'),
  })

  const runs = data?.runs || []

  // Aggregate KPI stats for current filtered list
  const totalGross = runs.reduce((acc, r) => acc + (Number(r.grossPay) || 0), 0)
  const totalNet = runs.reduce((acc, r) => acc + (Number(r.netPay) || 0), 0)
  const totalDeductions = runs.reduce((acc, r) => acc + (Number(r.deductions) || 0), 0)

  const columns = [
    {
      key: 'period', label: 'Pay Period', sortable: true,
      render: (val, row) => (
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-slate-200">
            {val || `${row.month} ${row.year}`}
          </span>
          <span className="text-[11px] text-slate-400">
            {formatDate(row.startDate)} – {formatDate(row.endDate)}
          </span>
        </div>
      ),
    },
    { 
      key: 'employeeCount', 
      label: 'Employees', 
      render: (val) => (
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
          <Users size={12} className="text-slate-500" />
          {val ?? '—'}
        </span>
      ) 
    },
    { 
      key: 'grossPay', 
      label: 'Gross Salary', 
      render: (val) => <span className="text-xs font-semibold text-slate-200">{formatCurrency(val)}</span> 
    },
    { 
      key: 'deductions', 
      label: 'Deductions', 
      render: (val) => <span className="text-xs font-semibold text-rose-400">{formatCurrency(val)}</span> 
    },
    { 
      key: 'netPay', 
      label: 'Net Payout', 
      render: (val) => <span className="text-xs font-bold text-emerald-400">{formatCurrency(val)}</span> 
    },
    {
      key: 'status', label: 'Status',
      render: (val = 'draft') => {
        const variant = { 
          draft: 'gray', 
          processing: 'warning', 
          processed: 'info', 
          approved: 'success', 
          paid: 'success' 
        }[val] || 'gray'
        return <Badge variant={variant} dot>{val.charAt(0).toUpperCase() + val.slice(1)}</Badge>
      },
    },
    { 
      key: 'processedAt', 
      label: 'Processed On', 
      render: (val) => val ? <span className="text-xs text-slate-300">{formatDate(val)}</span> : <span className="text-xs text-slate-500 italic">Unprocessed</span> 
    },
    {
      key: 'id', label: 'Actions',
      render: (id, row) => (
        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
          <button 
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            onClick={() => setSelectedRun(row)}
            title="View Breakdown"
          >
            <Eye size={14} />
          </button>
          {row.status === 'draft' && (
            <button
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 shadow-sm transition-colors"
              onClick={() => {
                if (confirm(`Process payroll run for ${row.employeeCount || 'all'} employees?`))
                  runPayrollMutation.mutate(id)
              }}
              disabled={runPayrollMutation.isPending}
            >
              <Play size={11} /> Process
            </button>
          )}
        </div>
      ),
    },
  ]

  const mobileCard = (row) => (
    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-200">{row.period || `${row.month} ${row.year}`}</p>
          <p className="text-[11px] text-slate-500">{formatDate(row.startDate)} – {formatDate(row.endDate)}</p>
        </div>
        <Badge variant={{ draft: 'gray', processing: 'warning', processed: 'info', approved: 'success', paid: 'success' }[row.status] || 'gray'} dot>
          {row.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/50">
        <div>Gross: <span className="font-semibold text-slate-200">{formatCurrency(row.grossPay)}</span></div>
        <div className="text-right">Net: <span className="font-bold text-emerald-400">{formatCurrency(row.netPay)}</span></div>
        <div>Deductions: <span className="font-semibold text-rose-400">{formatCurrency(row.deductions)}</span></div>
        <div className="text-right">Employees: <span className="font-semibold text-slate-300">{row.employeeCount ?? '—'}</span></div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
        <button 
          className="px-2 py-1 text-xs text-slate-300 bg-slate-800 rounded-md"
          onClick={() => setSelectedRun(row)}
        >
          View Details
        </button>
        {row.status === 'draft' && (
          <button
            className="px-2 py-1 text-xs text-white bg-blue-600 rounded-md flex items-center gap-1"
            onClick={() => runPayrollMutation.mutate(row.id)}
          >
            <Play size={11} /> Process
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-white tracking-tight">Payroll Runs</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
              <Building2 size={12} className="text-blue-400" />
              {companyName}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Managing {data?.total ?? 0} payroll execution periods
          </p>
        </div>

        <button
          className="flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-950 transition-colors"
          onClick={() => {
            const now = new Date()
            const period = `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`
            if (confirm(`Create payroll run for ${period}?`))
              runPayrollMutation.mutate(null)
          }}
          disabled={runPayrollMutation.isPending}
        >
          <Plus size={15} /> New Payroll Run
        </button>
      </div>

      {/* ── Metrics Cards Bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Gross Value</span>
            <DollarSign className="h-4 w-4 text-blue-400" />
          </div>
          <p className="text-xl font-bold text-white mt-2">{formatCurrency(totalGross)}</p>
          <span className="text-[11px] text-slate-500">Across current view</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Net Disbursed</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400 mt-2">{formatCurrency(totalNet)}</p>
          <span className="text-[11px] text-slate-500">Approved & paid amounts</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Deductions</span>
            <PieChart className="h-4 w-4 text-rose-400" />
          </div>
          <p className="text-xl font-bold text-rose-400 mt-2">{formatCurrency(totalDeductions)}</p>
          <span className="text-[11px] text-slate-500">Taxes & withholdings</span>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 shadow-sm">
        <FilterBar
          searchPlaceholder="Search payroll period..."
          filters={[
            { key: 'status', label: 'Status', options: PAYROLL_STATUS_OPTIONS },
          ]}
          values={params}
          onChange={(k, v) => setParams(p => ({ ...p, [k]: v, page: 1 }))}
        />
      </div>

      {/* ── Payroll Runs Table ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={runs}
          total={data?.total || 0}
          page={params.page}
          pageSize={params.limit}
          loading={isLoading}
          error={error}
          onPageChange={(page) => setParams(p => ({ ...p, page }))}
          mobileCard={mobileCard}
          emptyTitle="No payroll runs found"
          emptyDescription="Create a payroll run to execute employee salary payments."
        />
      </div>

      {/* ── Payroll Details Modal ── */}
      <Modal open={!!selectedRun} onClose={() => setSelectedRun(null)} title="Payroll Run Details" size="md">
        {selectedRun && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div>
                <p className="text-sm font-bold text-white">{selectedRun.period || `${selectedRun.month} ${selectedRun.year}`}</p>
                <p className="text-slate-400">{formatDate(selectedRun.startDate)} – {formatDate(selectedRun.endDate)}</p>
              </div>
              <Badge variant={{ draft: 'gray', processing: 'warning', processed: 'info', approved: 'success', paid: 'success' }[selectedRun.status] || 'gray'} dot>
                {selectedRun.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500">Employees</span>
                <p className="text-sm font-semibold text-slate-200">{selectedRun.employeeCount ?? '—'}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500">Gross Salary</span>
                <p className="text-sm font-semibold text-slate-200">{formatCurrency(selectedRun.grossPay)}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500">Total Deductions</span>
                <p className="text-sm font-semibold text-rose-400">{formatCurrency(selectedRun.deductions)}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500">Net Disbursed</span>
                <p className="text-sm font-bold text-emerald-400">{formatCurrency(selectedRun.netPay)}</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold"
                onClick={() => setSelectedRun(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { 
  Plus, 
  Building2, 
  Users, 
  ShieldCheck, 
  FileText, 
  Pencil, 
  Trash2, 
  Download, 
  X
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { settingsAPI } from '@/api/settings.api'
import { rolesAPI } from '@/api/roles.api'
import { authAPI } from '@/api/auth.api'
import { useAuthStore } from '@/store/auth.store'
import usePermission from '@/hooks/usePermission'
import { useForm } from 'react-hook-form'
import { formatDate } from '@/lib/utils'
import DataTable from '@/components/shared/DataTable'
import Pagination from '@/components/ui/Pagination'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import RoleFormModal from './RoleFormModel'
import UserFormModal from './users/UserFormModal'
import RoleStatCards from './roles/RoleStatCards'
import RoleCard from './roles/RoleCard'
import PermissionMatrixDrawer from './roles/PermissionMatrixDrawer'
import AuditStatCards from './audit/AuditStatCards'
import AuditModuleChart from './audit/AuditModuleChart'
import AuditLogRow from './audit/AuditLogRow'
import toast from 'react-hot-toast'

const TABS = [
  { key: 'company', label: 'Companies', icon: Building2 },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { key: 'audit', label: 'Audit Log', icon: FileText },
]

export default function Settings() {
  /*
   * The active tab lives in the URL (?tab=audit) rather than in local
   * state. Three things this fixes: the tabs are now linkable — which is
   * what lets "View Full Activity Log" on the profile page point
   * straight at the audit log — they survive a refresh, and the browser
   * back button steps between them instead of leaving the page.
   *
   * An unknown or absent ?tab falls back to 'company', so existing
   * /settings links keep landing exactly where they used to.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const activeTab = TABS.some((t) => t.key === requested) ? requested : 'company'

  const setActiveTab = (key) =>
    // replace, not push: clicking through four tabs should not put four
    // entries in the history stack for the user to back out through.
    setSearchParams(key === 'company' ? {} : { tab: key }, { replace: true })

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-[1600px] mx-auto w-full animate-fade-in">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-800/80">
        <h1 className="text-lg font-bold text-white tracking-tight">System Settings</h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage multi-tenant companies, system users, RBAC roles, and security audit logs
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 space-x-1 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-blue-400 border-blue-500 shadow-sm'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-blue-400' : 'text-slate-500'} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Views */}
      <div className="pt-2">
        {activeTab === 'company' && <CompanyTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'roles' && <RolesTab />}
        {activeTab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}

// ── Reusable field wrapper — avoids repeating label + input markup ──
//
// Declared at module scope, not inside CompanyTab. When a component is
// defined in the body of another component it is a BRAND NEW component
// type on every render, so React unmounts and remounts its whole subtree
// each time — which in a form means the input you are typing in is
// destroyed and recreated, losing focus and the caret position.
const FormField = ({ label, children }) => (
  <div className="space-y-1">
    <label className="font-semibold text-slate-300">{label}</label>
    {children}
  </div>
)

const inputCls =
  "w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none"

function CompanyTab() {
  const queryClient = useQueryClient()
  const [showDialog, setShowDialog] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const { refreshCompanies, activeCompany } = useAuthStore()
  const { isSuperAdmin } = usePermission()

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      name: '',
      type: '',
      industry: '',
      website: '',
      email: '',
      phone: '',
      address: '',
      currency: 'NPR',
      timezone: 'Asia/Kathmandu',
      // A new company defaults to sitting under the company you are
      // currently working in, so subsidiaries join the group without
      // anyone having to remember to set it. The server applies the
      // same default, so the two cannot disagree.
      parentId: activeCompany || '',
    },
  })

  useEffect(() => {
    if (editingCompany) {
      reset({
        name: editingCompany.name || '',
        type: editingCompany.type || '',
        industry: editingCompany.industry || '',
        website: editingCompany.website || '',
        email: editingCompany.email || '',
        phone: editingCompany.phone || '',
        address: editingCompany.address || '',
        currency: editingCompany.currency || 'NPR',
        timezone: editingCompany.timezone || 'Asia/Kathmandu',
        parentId: editingCompany.parentId || '',
      })
    }
  }, [editingCompany, reset])

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => settingsAPI.getCompanies().then((res) => res.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => settingsAPI.deleteCompany(id),
    onSuccess: () => {
      toast.success('Company deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
    },
    onError: () => toast.error('Unable to delete company'),
  })

  const createMutation = useMutation({
    mutationFn: (data) => settingsAPI.addCompany(data),
    onSuccess: async () => {
      toast.success('Company created')
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
      const res = await authAPI.getProfile()
      refreshCompanies(res.data.companies)
      reset()
      setShowDialog(false)
      setEditingCompany(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Unable to create company'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => settingsAPI.updateCompany(id, data),
    onSuccess: () => {
      toast.success('Company updated')
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
      reset()
      setEditingCompany(null)
      setShowDialog(false)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Unable to update company'),
  })

  const onSubmit = (data) => {
    // An empty <select> value is "", which the server's uuid rule would
    // reject. Send null to mean "no parent — this is a top-level company".
    const payload = { ...data, parentId: data.parentId || null }
    if (editingCompany) updateMutation.mutate({ id: editingCompany.id, data: payload })
    else createMutation.mutate(payload)
  }

  /*
   * Candidates for the parent-company picker.
   *
   * Excludes the company being edited: a company cannot be its own
   * parent. Deeper loops (A -> B -> A) are caught server-side by
   * assertNoCycle() in utils/companyTree.js, since the client does not
   * hold the full descendant list.
   */
  const parentOptions = companies.filter((c) => c.id !== editingCompany?.id)

  if (isLoading) {
    return <div className="h-48 rounded-xl bg-slate-900/50 animate-pulse border border-slate-800" />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-white">Registered Organizations</h2>
          <p className="text-xs text-slate-400">Manage companies operating within this CRM workspace</p>
        </div>

        <button
          className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors"
          onClick={() => {
            reset()
            setEditingCompany(null)
            setShowDialog(true)
          }}
        >
          <Plus size={15} /> Add Company
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3.5">Company Name</th>
                <th className="p-3.5">Parent Company</th>
                <th className="p-3.5">Industry</th>
                <th className="p-3.5">Contact Email</th>
                <th className="p-3.5">Phone Number</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    No registered companies found
                  </td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr key={company.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-semibold text-slate-200">{company.name}</td>
                    <td className="p-3.5 text-slate-400">
                      {company.parent?.name || (
                        <span className="text-slate-600">Top level</span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-400">{company.industry || '—'}</td>
                    <td className="p-3.5 text-slate-400">{company.email || '—'}</td>
                    <td className="p-3.5 text-slate-400">{company.phone || '—'}</td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                          onClick={() => {
                            setEditingCompany(company)
                            setShowDialog(true)
                          }}
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          onClick={() => {
                            if (window.confirm(`Delete company "${company.name}"?`)) {
                              deleteMutation.mutate(company.id)
                            }
                          }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {editingCompany ? 'Edit Company Profile' : 'Register New Company'}
              </h3>
              <button onClick={() => setShowDialog(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 text-xs">
              <FormField label="Company Name *">
                <input
                  {...register('name', { required: 'Company name is required' })}
                  className={inputCls}
                  placeholder="e.g. OS Group Pvt Ltd"
                />
                {errors.name && <p className="text-red-400 text-[11px] mt-0.5">{errors.name.message}</p>}
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Industry">
                  <input {...register('industry')} className={inputCls} placeholder="e.g. Technology" />
                </FormField>
                <FormField label="Website">
                  <input {...register('website')} className={inputCls} placeholder="https://..." />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Email Address">
                  <input {...register('email')} className={inputCls} placeholder="info@company.com" type="email" />
                </FormField>
                <FormField label="Phone">
                  <input
                    {...register('phone', {
                      pattern: {
                        value: /^\d{10}$/,
                        message: 'Phone must be exactly 10 digits',
                      },
                    })}
                    className={inputCls}
                    placeholder="10-digit number"
                    maxLength={10}
                    inputMode="numeric"
                    onKeyDown={(e) => {
                      // allow: backspace, delete, tab, arrows, home, end
                      const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End']
                      if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault()
                    }}
                  />
                  {errors.phone && <p className="text-red-400 text-[11px] mt-0.5">{errors.phone.message}</p>}
                </FormField>
              </div>

              <FormField label="Address">
                <textarea
                  {...register('address')}
                  rows={2}
                  className={inputCls}
                  placeholder="Headquarters physical address..."
                />
              </FormField>

              {/*
                Group hierarchy. companies.parentId has existed in the
                schema since the MySQL migration, and index.js has always
                declared the parent/children association — but no screen
                ever set it, so every company was a disconnected root and
                the parent company could not see anything.
              */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Parent Company">
                  <select {...register('parentId')} className={inputCls}>
                    {/*
                      Only a super admin may detach a company from the
                      group. For everyone else the option is not offered,
                      and the server enforces the same rule — a
                      top-level company is outside every parent's
                      oversight, which should be a deliberate act.
                    */}
                    {isSuperAdmin && (
                      <option value="">None — independent, top-level company</option>
                    )}
                    {parentOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Its parent sees this company in the Group Console.
                  </p>
                </FormField>

                <FormField label="Company Type">
                  <input
                    {...register('type')}
                    className={inputCls}
                    placeholder="e.g. Subsidiary"
                  />
                </FormField>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                  onClick={() => setShowDialog(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
                >
                  {editingCompany ? 'Update Profile' : 'Create Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function UsersTab() {
  const [showDialog, setShowDialog] = useState(false)
  const [params, setParams] = useState({ page: 1, limit: 10 })
  const [showUnassigned, setShowUnassigned] = useState(false)
  const navigate = useNavigate()

  const query = { ...params, unassigned: showUnassigned || undefined }

  const { data, isLoading } = useQuery({
    queryKey: ['settings-users', query],
    queryFn: () => settingsAPI.getUsers(query).then((r) => r.data),
  })

  const unassignedCount = data?.unassignedCount || 0
  // Accounts with no home company AND no membership — the ones that are
  // genuinely unusable, as opposed to merely untidy.
  const blockedCount = data?.blockedCount || 0

  const toggleUnassigned = () => {
    // Reset to page 1: the unassigned list is a different, much shorter
    // result set, so keeping the current offset would show nothing.
    setShowUnassigned((v) => !v)
    setParams((p) => ({ ...p, page: 1 }))
  }

  const columns = [
    {
      key: 'name',
      label: 'User Name',
      render: (val, row) => (
        <div className="flex items-center gap-2.5 min-w-[160px]">
          <Avatar name={val} size="sm" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate">{val}</p>
            <p className="text-[11px] text-slate-400 truncate">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      label: 'Assigned Company',
      render: (val, row) => (
        <span className="text-xs text-slate-300">
          {val?.name || row.companies?.[0]?.name || '—'}
        </span>
      ),
    },
    {
      key: 'roleInfo',
      label: 'RBAC Permission Role',
      render: (val) =>
        val?.name ? <Badge variant="success">{val.name}</Badge> : <Badge variant="gray">No Role</Badge>,
    },
    {
      key: 'role',
      label: 'System Access Level',
      render: (val) => <Badge variant="info">{val?.replace('_', ' ')}</Badge>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val = 'active') => (
        <Badge variant={val === 'active' ? 'success' : 'gray'} dot>
          {val}
        </Badge>
      ),
    },
    {
      key: 'lastLogin',
      label: 'Last Session',
      render: (val) => (val ? <span className="text-xs text-slate-400">{formatDate(val)}</span> : <span className="text-xs text-slate-500 italic">Never</span>),
    },
    {
      key: 'id',
      label: 'Actions',
      render: (id) => (
        <button
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/settings/users/${id}/edit`)
          }}
          title="Edit User"
        >
          <Pencil size={14} />
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-white">System User Accounts</h2>
          <p className="text-xs text-slate-400">Manage user access credentials and organization scopes</p>
        </div>

        <button
          className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors"
          onClick={() => setShowDialog(true)}
        >
          <Plus size={15} /> Add User
        </button>
      </div>

      {/*
        Self-registered accounts that were never assigned to a company.
        They can sign in but every request is rejected by the tenant
        guard, and until now they appeared in no list anywhere — so they
        accumulated silently and could not be assigned or removed.
      */}
      {(unassignedCount > 0 || showUnassigned) && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border p-3.5 ${
            blockedCount > 0
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-slate-800 bg-slate-900/60'
          }`}
        >
          <div>
            <p
              className={`text-xs font-semibold ${
                blockedCount > 0 ? 'text-amber-300' : 'text-slate-300'
              }`}
            >
              {blockedCount > 0
                ? `${blockedCount} account${blockedCount === 1 ? '' : 's'} cannot use the app`
                : `${unassignedCount} retired account${unassignedCount === 1 ? '' : 's'} with no home company`}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {blockedCount > 0
                ? 'These have no company and no membership, so they can sign in but every request is rejected. Open one to assign it a company, or set its status to inactive if it is no longer needed.'
                : 'Already deactivated, so nothing needs doing. They appear in no other list, so this is the only way back to them if you ever need to restore one.'}
            </p>
          </div>

          <button
            onClick={toggleUnassigned}
            className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              showUnassigned
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {showUnassigned ? 'Show all users' : 'Review them'}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={data?.users || []}
          total={data?.total || 0}
          page={params.page}
          pageSize={params.limit}
          loading={isLoading}
          onPageChange={(page) => setParams((p) => ({ ...p, page }))}
          onRowClick={(row) => navigate(`/settings/users/${row.id}`)}
          emptyTitle="No system users found"
        />
      </div>

      <UserFormModal open={showDialog} onClose={() => setShowDialog(false)} />
    </div>
  )
}

function RolesTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [viewingRole, setViewingRole] = useState(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['roles', debouncedSearch, statusFilter],
    queryFn: () => rolesAPI.getAll({ search: debouncedSearch, status: statusFilter }).then((res) => res.data),
  })

  const roles = data?.roles || []

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      name: '',
      description: '',
      permissions: {},
      companyId: '',
      parentRoleId: '',
      // Matches the seeded Manager. Without a value the select renders
      // blank and the role saves at level 0 again.
      level: 60,
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roles'] })
    queryClient.invalidateQueries({ queryKey: ['roles-stats'] })
  }

  const createMutation = useMutation({
    mutationFn: (values) => rolesAPI.create(values),
    onSuccess: () => {
      invalidate()
      setModalOpen(false)
      toast.success('Role created successfully')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }) => rolesAPI.update(id, values),
    onSuccess: () => {
      invalidate()
      setModalOpen(false)
      toast.success('Role updated successfully')
    },
  })

  const openCreateModal = () => {
    setEditingRole(null)
    reset({ name: '', description: '', permissions: {}, companyId: '', parentRoleId: '', level: 60 })
    setModalOpen(true)
  }

  const openEditModal = (role) => {
    setEditingRole(role)
    reset({
      name: role.name || '',
      description: role.description || '',
      permissions: role.permissions || {},
      companyId: role.companyId || '',
      parentRoleId: role.parentRoleId || '',
      level: role.level ?? 60,
    })
    setModalOpen(true)
  }

  return (
    <div className="space-y-4">
      <RoleStatCards />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 flex-1">
          <input
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none flex-1 max-w-xs"
            placeholder="Search RBAC roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <button
          className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors"
          onClick={openCreateModal}
        >
          <Plus size={15} /> Create Role
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 bg-slate-900/50 rounded-xl border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onView={setViewingRole}
              onEdit={openEditModal}
            />
          ))}
        </div>
      )}

      <RoleFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        register={register}
        handleSubmit={handleSubmit}
        onSubmit={(values) =>
          editingRole ? updateMutation.mutate({ id: editingRole.id, values }) : createMutation.mutate(values)
        }
        loading={createMutation.isPending || updateMutation.isPending}
        watch={watch}
        setValue={setValue}
        mode={editingRole ? 'edit' : 'create'}
      />

      {viewingRole && <PermissionMatrixDrawer role={viewingRole} onClose={() => setViewingRole(null)} />}
    </div>
  )
}

function AuditTab() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // `page` had no setter, so the audit log was permanently frozen on
  // page 1 and only the 20 most recent events were ever reachable.
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const limit = 20

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  // A new search must restart at page 1, or a search run from page 5
  // lands on an offset the filtered result set does not reach. Done in
  // the input's own handler rather than an effect on [debouncedSearch],
  // which would first render — and fetch — with the new filter and the
  // stale page number.
  const onSearchChange = (value) => {
    setSearch(value)
    setPage(1)
  }

  const queryParams = { page, limit, search: debouncedSearch || undefined }

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', queryParams],
    queryFn: () => settingsAPI.getAuditLogs(queryParams).then((r) => r.data),
    placeholderData: keepPreviousData,
  })

  const logs = data?.logs || []
  const total = data?.total || 0

  // The Export CSV button had no onClick at all: settingsAPI.exportAuditLogs
  // already existed but nothing called it, so the button was decorative.
  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await settingsAPI.exportAuditLogs({
        search: debouncedSearch || undefined,
      })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Audit log exported')
    } catch {
      // The axios interceptor has already shown the reason.
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <AuditStatCards />
      <AuditModuleChart />

      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
        <input
          className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none max-w-sm w-full"
          placeholder="Filter audit actions, records or resources..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 transition-colors"
        >
          <Download size={14} className="text-slate-400" />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm divide-y divide-slate-800/60">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading security logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No audit records found matching your filters.
          </div>
        ) : (
          logs.map((log) => <AuditLogRow key={log.id} log={log} />)
        )}
      </div>

      <Pagination page={page} pageSize={limit} total={total} onChange={setPage} />
    </div>
  )
}
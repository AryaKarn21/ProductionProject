import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { useNavigate } from 'react-router-dom'
import { settingsAPI } from '@/api/settings.api'
import { rolesAPI } from '@/api/roles.api'
import { authAPI } from '@/api/auth.api'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { formatDate } from '@/lib/utils'
import DataTable from '@/components/shared/DataTable'
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
  const [activeTab, setActiveTab] = useState('company')

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

function CompanyTab() {
  const queryClient = useQueryClient()
  const [showDialog, setShowDialog] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const { refreshCompanies } = useAuthStore()

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      name: '',
      industry: '',
      website: '',
      email: '',
      phone: '',
      address: '',
      currency: 'NPR',
      timezone: 'Asia/Kathmandu',
    },
  })

  useEffect(() => {
    if (editingCompany) {
      reset({
        name: editingCompany.name || '',
        industry: editingCompany.industry || '',
        website: editingCompany.website || '',
        email: editingCompany.email || '',
        phone: editingCompany.phone || '',
        address: editingCompany.address || '',
        currency: editingCompany.currency || 'NPR',
        timezone: editingCompany.timezone || 'Asia/Kathmandu',
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
    if (editingCompany) updateMutation.mutate({ id: editingCompany.id, data })
    else createMutation.mutate(data)
  }

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
                <th className="p-3.5">Industry</th>
                <th className="p-3.5">Contact Email</th>
                <th className="p-3.5">Phone Number</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-500">
                    No registered companies found
                  </td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr key={company.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-semibold text-slate-200">{company.name}</td>
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
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Company Name *</label>
                <input
                  {...register('name', { required: true })}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. OS Group Pvt Ltd"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Industry</label>
                  <input
                    {...register('industry')}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. Technology"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Website</label>
                  <input
                    {...register('website')}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Email Address</label>
                  <input
                    {...register('email')}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                    placeholder="info@company.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Phone</label>
                  <input
                    {...register('phone')}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                    placeholder="+977..."
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Address</label>
                <textarea
                  {...register('address')}
                  rows={2}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                  placeholder="Headquarters physical address..."
                />
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
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['settings-users', params],
    queryFn: () => settingsAPI.getUsers(params).then((r) => r.data),
  })

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
    reset({ name: '', description: '', permissions: {}, companyId: '', parentRoleId: '' })
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
  const [page] = useState(1)
  const limit = 20

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  const queryParams = { page, limit, search: debouncedSearch || undefined }

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', queryParams],
    queryFn: () => settingsAPI.getAuditLogs(queryParams).then((r) => r.data),
  })

  const logs = data?.logs || []

  return (
    <div className="space-y-4">
      <AuditStatCards />
      <AuditModuleChart />

      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
        <input
          className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none max-w-sm w-full"
          placeholder="Filter audit actions or resources..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors">
          <Download size={14} className="text-slate-400" /> Export CSV
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
    </div>
  )
}
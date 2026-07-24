import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { settingsAPI } from '@/api/settings.api'
import { Tabs } from '@/components/ui/Tabs'
import DataTable from '@/components/shared/DataTable'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import { useForm } from 'react-hook-form'
import { formatDate } from '@/lib/utils'
import RoleFormModal from './RoleFormModel'
import UserFormModal from './users/UserFormModal'
import toast from 'react-hot-toast'
import { useEffect } from 'react'
//import CompanyTable from '@/components/settings/CompanyTable'
import { useAuthStore } from '@/store/auth.store'
import { rolesAPI } from '@/api/roles.api'
import { authAPI } from '@/api/auth.api'
import RoleStatCards from './roles/RoleStatCards'
import RoleCard from './roles/RoleCard'
import RoleTable from './roles/RoleTable'
import PermissionMatrixDrawer from './roles/PermissionMatrixDrawer'
import AuditStatCards from './audit/AuditStatCards'
import AuditModuleChart from './audit/AuditModuleChart'
import AuditLogRow from './audit/AuditLogRow'
import AuditTimeline from './audit/AuditTimeline'

const TABS = [
  { key: 'company', label: 'Company' },
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles & Permissions' },
  { key: 'audit', label: 'Audit Log' },
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState('company')

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Settings
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Manage your company and platform settings
          </p>
        </div>
      </div>

      <div className="mx-6 mt-4 mb-6 card overflow-hidden">
        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
        <div className="p-6">
          {activeTab === 'company' && <CompanyTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'roles' && <RolesTab />}
          {activeTab === 'audit' && <AuditTab />}
        </div>
      </div>
    </div>
  )
}

function CompanyTab() {
  const queryClient = useQueryClient()

  const [showDialog, setShowDialog] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const { refreshCompanies } = useAuthStore()
  const {
    register,
    handleSubmit,
    reset,
  } = useForm({
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
      toast.success('Company deleted')
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
    },
    onError: () => {
      toast.error('Unable to delete company')
    },
  })

  const createMutation = useMutation({
    mutationFn: (data) => settingsAPI.addCompany(data),
    onSuccess: async () => {
      toast.success("Company created")
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
      const res = await authAPI.getProfile()
      refreshCompanies(res.data.companies)
      reset()
      setShowDialog(false)
      setEditingCompany(null)
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Unable to create company")
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => settingsAPI.updateCompany(id, data),
    onSuccess: () => {
      toast.success("Company updated")
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
      reset()
      setEditingCompany(null)
      setShowDialog(false)
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Unable to update company")
    },
  })

  const onSubmit = (data) => {
    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  if (isLoading) {
    return (
      <div className="h-40 rounded-xl animate-pulse" style={{ background: "var(--border)" }} />
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Companies
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Manage all companies
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            reset()
            setEditingCompany(null)
            setShowDialog(true)
          }}
        >
          + Add Company
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th className="text-left p-3">Company</th>
              <th className="text-left p-3">Industry</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Phone</th>
              <th className="text-center p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10">
                  No companies found
                </td>
              </tr>
            ) : (
              companies.map((company) => (
                <tr key={company.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3 font-medium">{company.name}</td>
                  <td className="p-3">{company.industry || "-"}</td>
                  <td className="p-3">{company.email || "-"}</td>
                  <td className="p-3">{company.phone || "-"}</td>
                  <td className="p-3">
                    <div className="flex justify-center gap-2">
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          setEditingCompany(company)
                          setShowDialog(true)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm text-red-500"
                        onClick={() => {
                          if (window.confirm(`Delete ${company.name}?`)) {
                            deleteMutation.mutate(company.id)
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDialog && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,.5)" }}
        >
          <div className="card w-[500px] p-6">
            <h2 className="text-xl font-bold mb-4">
              {editingCompany ? "Edit Company" : "Add Company"}
            </h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Company Name</label>
                <input {...register("name")} className="input w-full" placeholder="OS Group Pvt Ltd" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Industry</label>
                  <input {...register("industry")} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Website</label>
                  <input className="input w-full" {...register("website")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Email</label>
                  <input className="input w-full" placeholder="info@company.com" {...register("email")} />
                </div>
                <div>
                  <label className="block text-sm mb-1">Phone</label>
                  <input {...register("phone")} className="input w-full" placeholder="+977..." />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-1">Address</label>
                <textarea {...register("address")} rows={3} className="input w-full" />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    reset()
                    setEditingCompany(null)
                    setShowDialog(false)
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingCompany ? "Update Company" : "Create Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function UsersTab() {
  const [showDialog, setShowDialog] = useState(false)
  const queryClient = useQueryClient()
  const [params, setParams] = useState({ page: 1, limit: 10 })
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['settings-users', params],
    queryFn: () => settingsAPI.getUsers(params).then(r => r.data),
  })

  // The Add User form now lives in ./users/UserFormModal.jsx, which owns
  // its own react-hook-form state and mutation. It was moved out because
  // it needed two new fields — Company and Permission Role — and keeping
  // that inline made this file harder to work in.
  //
  // The old inline version had no company selector at all, so every user
  // it created ended up with companyId = null and could not be scoped to
  // any tenant.

  const deactivateMutation = useMutation({
    mutationFn: (id) => settingsAPI.deactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-users'] })
      toast.success('User deactivated')
    },
  })

  const columns = [
    {
      key: 'name', label: 'User',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <Avatar name={val} size="sm" />
          <div>
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{val}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      // Which company this person is an employee of. GET /settings/users
      // now returns `company`, so a super admin browsing across tenants
      // can tell at a glance who belongs where.
      key: 'company', label: 'Company',
      render: (val, row) => (
        <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>
          {val?.name || row.companies?.[0]?.name || '-'}
        </span>
      ),
    },
    {
      // The RBAC role — what the permission matrix actually controls.
      // There was previously no way to see it anywhere in the UI.
      key: 'roleInfo', label: 'Permission Role',
      render: (val) =>
        val?.name
          ? <Badge variant="success">{val.name}</Badge>
          : <Badge variant="gray">No role</Badge>,
    },
    {
      key: 'role', label: 'System Role',
      render: (val) => <Badge variant="info">{val?.replace('_', ' ')}</Badge>,
    },
    {
      key: 'status', label: 'Status',
      render: (val = 'active') => (
        <Badge variant={val === 'active' ? 'success' : 'gray'} dot>{val}</Badge>
      ),
    },
    {
      key: 'lastLogin', label: 'Last Login',
      render: (val) => val ? formatDate(val) : 'Never',
    },
    {
      key: 'id',
      label: 'Actions',
      render: (id) => (
        <button
          className="btn btn-secondary btn-sm"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/settings/users/${id}/edit`)
          }}
        >
          Edit
        </button>
      ),
    },
  ]

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm">Manage all users</p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowDialog(true)}>
          + Add User
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data?.users || []}
        total={data?.total || 0}
        page={params.page}
        pageSize={params.limit}
        loading={isLoading}
        onPageChange={(page) => setParams(p => ({ ...p, page }))}
        onRowClick={(row) => navigate(`/settings/users/${row.id}`)}
        emptyTitle="No users found"
      />

      {/* Add User — company + permission role selectors live here */}
      <UserFormModal open={showDialog} onClose={() => setShowDialog(false)} />
    </>
  )
}

/*
| Converts stored permissions back into the flat shape this form uses.
|
| The server stores action-level keys ({ "leads.view": true,
| "leads.create": true }), but PermissionGroup registers one checkbox per
| MODULE ({ leads: true }). Without this conversion the edit form loaded
| every box unchecked, and saving then wiped the role's permissions.
|
| A module reads as ticked when any of its actions are granted.
*/
function toFlatPermissions(stored) {
  const flat = {}
  if (!stored || typeof stored !== 'object') return flat

  for (const [key, value] of Object.entries(stored)) {
    if (value === true) {
      // "leads.view" -> leads ;  "leads" -> leads
      flat[key.split('.')[0]] = true
    }
  }
  return flat
}

function RolesTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [viewingRole, setViewingRole] = useState(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [viewMode, setViewMode] = useState('card')
  const [selectedIds, setSelectedIds] = useState([])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['roles', debouncedSearch, statusFilter],
    queryFn: () => rolesAPI.getAll({ search: debouncedSearch, status: statusFilter }).then((res) => res.data),
  })

  const roles = data?.roles || []

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      name: '',
      description: '',
      permissions: {},
      // A role belongs to exactly one company. The server used to take
      // this from req.companyId, so a super admin working across
      // companies had no way to say which tenant a new role was for.
      companyId: '',
      // Optional parent — a child role inherits everything its parent
      // grants, resolved server-side in resolveRolePermissions().
      parentRoleId: '',
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roles'] })
    queryClient.invalidateQueries({ queryKey: ['roles-stats'] })
  }

  const createMutation = useMutation({
    mutationFn: (values) => rolesAPI.create(values),
    onSuccess: () => { invalidate(); closeModal(); toast.success('Role created') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to create role'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }) => rolesAPI.update(id, values),
    onSuccess: () => { invalidate(); closeModal(); toast.success('Role updated') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to update role'),
  })

  const cloneMutation = useMutation({
    mutationFn: (id) => rolesAPI.clone(id),
    onSuccess: () => { invalidate(); toast.success('Role cloned') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to clone role'),
  })

  const activateMutation = useMutation({
    mutationFn: (id) => rolesAPI.activate(id),
    onSuccess: () => { invalidate(); toast.success('Role activated') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to activate role'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => rolesAPI.deactivate(id),
    onSuccess: () => { invalidate(); toast.success('Role deactivated') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to deactivate role'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => rolesAPI.delete(id),
    onSuccess: () => { invalidate(); toast.success('Role moved to trash') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to delete role'),
  })

  const restoreMutation = useMutation({
    mutationFn: (id) => rolesAPI.restore(id),
    onSuccess: () => { invalidate(); toast.success('Role restored') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to restore role'),
  })

  const permanentDeleteMutation = useMutation({
    mutationFn: (id) => rolesAPI.permanentDelete(id),
    onSuccess: () => { invalidate(); toast.success('Role permanently deleted') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to permanently delete role'),
  })

  const bulkActivateMutation = useMutation({
    mutationFn: (ids) => rolesAPI.bulkActivate(ids),
    onSuccess: () => { invalidate(); setSelectedIds([]); toast.success('Roles activated') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Bulk activate failed'),
  })
  const bulkDeactivateMutation = useMutation({
    mutationFn: (ids) => rolesAPI.bulkDeactivate(ids),
    onSuccess: () => { invalidate(); setSelectedIds([]); toast.success('Roles deactivated') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Bulk deactivate failed'),
  })
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => rolesAPI.bulkDelete(ids),
    onSuccess: () => { invalidate(); setSelectedIds([]); toast.success('Roles moved to trash') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Bulk delete failed'),
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
      permissions: toFlatPermissions(role.permissions),
      companyId: role.companyId || '',
      parentRoleId: role.parentRoleId || '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingRole(null)
  }

  const onSubmit = (values) => {
    if (!values.name?.trim()) {
      toast.error('Role name is required')
      return
    }
    if (editingRole) updateMutation.mutate({ id: editingRole.id, values })
    else createMutation.mutate(values)
  }

  const toggleSelect = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const toggleSelectAll = () =>
    setSelectedIds((prev) => (prev.length === roles.length ? [] : roles.map((r) => r.id)))

  const anyBulkPending =
    bulkActivateMutation.isPending || bulkDeactivateMutation.isPending || bulkDeleteMutation.isPending

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <RoleStatCards />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          className="input flex-1"
          placeholder="Search roles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search roles"
        />
        <select
          className="input sm:w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <div className="flex rounded-lg border overflow-hidden shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            className="px-3 py-2 text-[12px] transition-colors"
            style={{
              background: viewMode === 'card' ? 'var(--surface-2)' : 'transparent',
              color: 'var(--text-primary)',
              fontWeight: viewMode === 'card' ? 600 : 400,
            }}
            onClick={() => setViewMode('card')}
            aria-pressed={viewMode === 'card'}
          >
            Cards
          </button>
          <button
            type="button"
            className="px-3 py-2 text-[12px] transition-colors"
            style={{
              background: viewMode === 'table' ? 'var(--surface-2)' : 'transparent',
              color: 'var(--text-primary)',
              fontWeight: viewMode === 'table' ? 600 : 400,
            }}
            onClick={() => setViewMode('table')}
            aria-pressed={viewMode === 'table'}
          >
            Table
          </button>
        </div>

        <button className="btn btn-primary shrink-0" onClick={openCreateModal}>
          Create Role
        </button>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
            {selectedIds.length} selected
          </span>
          <button className="btn btn-ghost btn-sm" disabled={anyBulkPending} onClick={() => bulkActivateMutation.mutate(selectedIds)}>
            Activate
          </button>
          <button className="btn btn-ghost btn-sm" disabled={anyBulkPending} onClick={() => bulkDeactivateMutation.mutate(selectedIds)}>
            Deactivate
          </button>
          <button
            className="btn btn-ghost btn-sm text-red-500"
            disabled={anyBulkPending}
            onClick={() => {
              if (confirm(`Move ${selectedIds.length} role(s) to trash?`)) bulkDeleteMutation.mutate(selectedIds)
            }}
          >
            Delete
          </button>
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setSelectedIds([])}>
            Clear
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl" style={{ background: 'var(--border)' }} />
          ))}
        </div>
      ) : isError ? (
        <div className="card p-6 text-center">
          <p className="text-[13px] font-medium text-red-500">Failed to load roles</p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {error?.response?.data?.message || 'Something went wrong. Please try again.'}
          </p>
          <button className="btn btn-secondary btn-sm mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ['roles'] })}>
            Retry
          </button>
        </div>
      ) : roles.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
            {debouncedSearch || statusFilter ? 'No roles match your filters' : 'No roles yet'}
          </p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {debouncedSearch || statusFilter ? 'Try adjusting your search or filters.' : 'Create your first role to get started.'}
          </p>
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              selected={selectedIds.includes(role.id)}
              onToggleSelect={() => toggleSelect(role.id)}
              onView={setViewingRole}
              onEdit={openEditModal}
              onClone={(r) => cloneMutation.mutate(r.id)}
              onActivate={(r) => activateMutation.mutate(r.id)}
              onDeactivate={(r) => deactivateMutation.mutate(r.id)}
              onDelete={(r) => { if (confirm(`Move "${r.name}" to trash?`)) deleteMutation.mutate(r.id) }}
              onRestore={(r) => restoreMutation.mutate(r.id)}
              onPermanentDelete={(r) => { if (confirm(`Permanently delete "${r.name}"? This cannot be undone.`)) permanentDeleteMutation.mutate(r.id) }}
            />
          ))}
        </div>
      ) : (
        <RoleTable
          roles={roles}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={setViewingRole}
          onEdit={openEditModal}
          onClone={(r) => cloneMutation.mutate(r.id)}
          onActivate={(r) => activateMutation.mutate(r.id)}
          onDeactivate={(r) => deactivateMutation.mutate(r.id)}
          onDelete={(r) => { if (confirm(`Move "${r.name}" to trash?`)) deleteMutation.mutate(r.id) }}
          onRestore={(r) => restoreMutation.mutate(r.id)}
          onPermanentDelete={(r) => { if (confirm(`Permanently delete "${r.name}"? This cannot be undone.`)) permanentDeleteMutation.mutate(r.id) }}
        />
      )}

      <RoleFormModal
        open={modalOpen}
        onClose={closeModal}
        register={register}
        handleSubmit={handleSubmit}
        onSubmit={onSubmit}
        loading={createMutation.isPending || updateMutation.isPending}
        watch={watch}
        setValue={setValue}
        mode={editingRole ? 'edit' : 'create'}
        editingRoleId={editingRole?.id}
      />

      {viewingRole && <PermissionMatrixDrawer role={viewingRole} onClose={() => setViewingRole(null)} />}
    </div>
  )
}

function AuditTab() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [page, setPage] = useState(1)
  const limit = 20

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, moduleFilter, statusFilter, startDate, endDate])

  const { data: statsData } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: () => settingsAPI.getAuditStats().then((r) => r.data),
  })

  const queryParams = {
    page,
    limit,
    search: debouncedSearch || undefined,
    module: moduleFilter || undefined,
    status: statusFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit-logs', queryParams],
    queryFn: () => settingsAPI.getAuditLogs(queryParams).then((r) => r.data),
  })

  const logs = data?.logs || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await settingsAPI.exportAuditLogs(queryParams)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-logs-${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Audit log exported')
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setModuleFilter('')
    setStatusFilter('')
    setStartDate('')
    setEndDate('')
  }

  const hasActiveFilters = debouncedSearch || moduleFilter || statusFilter || startDate || endDate
  const moduleOptions = (statsData?.byModule || []).map((m) => m.module).filter(Boolean)

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <AuditStatCards />
      <AuditModuleChart />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1"
            placeholder="Search by action, resource, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search audit logs"
          />
          <button className="btn btn-secondary shrink-0" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            className="input sm:w-40"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            aria-label="Filter by module"
          >
            <option value="">All Modules</option>
            {moduleOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            className="input sm:w-36"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>

          <input
            type="date"
            className="input sm:w-40"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date"
          />
          <input
            type="date"
            className="input sm:w-40"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="End date"
          />

          <div className="flex rounded-lg border overflow-hidden shrink-0" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              className="px-3 py-2 text-[12px] transition-colors"
              style={{
                background: viewMode === 'list' ? 'var(--surface-2)' : 'transparent',
                color: 'var(--text-primary)',
                fontWeight: viewMode === 'list' ? 600 : 400,
              }}
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
            >
              List
            </button>
            <button
              type="button"
              className="px-3 py-2 text-[12px] transition-colors"
              style={{
                background: viewMode === 'timeline' ? 'var(--surface-2)' : 'transparent',
                color: 'var(--text-primary)',
                fontWeight: viewMode === 'timeline' ? 600 : 400,
              }}
              onClick={() => setViewMode('timeline')}
              aria-pressed={viewMode === 'timeline'}
            >
              Timeline
            </button>
          </div>

          {hasActiveFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-4 flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--border)' }} />
            ))}
          </div>
        ) : isError ? (
          <div className="p-6 text-center">
            <p className="text-[13px] font-medium text-red-500">Failed to load audit logs</p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {error?.response?.data?.message || 'Something went wrong. Please try again.'}
            </p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {hasActiveFilters ? 'No logs match your filters' : 'No audit logs yet'}
            </p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {hasActiveFilters ? 'Try adjusting your search or filters.' : 'Activity will appear here as it happens.'}
            </p>
          </div>
        ) : viewMode === 'timeline' ? (
          <AuditTimeline logs={logs} />
        ) : (
          logs.map((log) => <AuditLogRow key={log.id} log={log} />)
        )}

        {!isLoading && !isError && logs.length > 0 && (
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t text-[12px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <span>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
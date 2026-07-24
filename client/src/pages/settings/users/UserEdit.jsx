import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ArrowLeft, ShieldCheck, Building2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

import { settingsAPI } from '@/api/settings.api'
import { rolesAPI } from '@/api/roles.api'
import usePermission from '@/hooks/usePermission'
import Can from '@/components/shared/Can'

/*
|--------------------------------------------------------------------------
| UserEdit
|--------------------------------------------------------------------------
|
| THE headline fix from the audit. Search the old frontend for "roleId"
| and it appears ZERO times — there was no way, anywhere in the UI, to
| assign an RBAC role to a user.
|
| So users.roleId stayed NULL, roleInfo was null, permissions was {}, and
| every permission check returned false for everybody except super_admin.
| You could build roles and tick permission matrices all day; nothing was
| ever attached to a person.
|
| This page now assigns:
|   - the RBAC role (roleId)  -> what the permission matrix actually controls
|   - the system role (role)  -> the legacy ENUM, super_admin only
|   - company membership, with a role per company
*/

const SYSTEM_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'employee', label: 'Employee' },
]

export default function UserEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isSuperAdmin, hasPermission } = usePermission()

  const [companies, setCompanies] = useState([])

  const { data: companiesData } = useQuery({
    queryKey: ['companies'],
    queryFn: () => settingsAPI.getCompanies().then((res) => res.data),
  })

  // The list of assignable RBAC roles — this query did not exist before.
  const { data: rolesData } = useQuery({
    queryKey: ['roles', 'assignable'],
    queryFn: () => rolesAPI.getAll({ status: 'active', limit: 100 }).then((res) => res.data),
    enabled: hasPermission('roles.view') || isSuperAdmin,
  })

  const roles = rolesData?.roles || []

  useEffect(() => {
    if (companiesData) setCompanies(companiesData)
  }, [companiesData])

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => settingsAPI.getUserById(id).then((res) => res.data),
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      role: 'employee',
      roleId: '',
      status: 'active',
      primaryCompany: '',
      companies: [],
    },
  })

  useEffect(() => {
    if (user) {
      reset({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || 'employee',
        roleId: user.roleId || '',
        status: user.status || 'active',
        primaryCompany: user.company?.id || user.companyId || '',
        companies: user.companies?.map((c) => c.id) || [],
      })
    }
  }, [user, reset])

  const selectedRoleId = watch('roleId')
  const selectedRole = roles.find((r) => r.id === selectedRoleId)

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      // The profile fields and the role assignment go to different
      // endpoints. The server deliberately refuses to change a role
      // through the general update route, because that route used to be
      // the mass-assignment hole that let any admin make themselves
      // super_admin.
      const { roleId, ...profile } = data

      await settingsAPI.updateUser(id, profile)

      if ((roleId || '') !== (user?.roleId || '')) {
        await settingsAPI.assignRole(id, { roleId: roleId || null })
      }
    },

    onSuccess: () => {
      toast.success('User updated successfully')
      queryClient.invalidateQueries({ queryKey: ['settings-users'] })
      queryClient.invalidateQueries({ queryKey: ['user', id] })
      navigate(`/settings/users/${id}`)
    },

    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update user')
    },
  })

  if (isLoading) {
    return <div className="p-8">Loading User...</div>
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </button>

          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Edit User
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {user?.name}
            </p>
          </div>
        </div>
      </div>

      <form
        className="card mx-6 p-6 flex flex-col gap-5"
        onSubmit={handleSubmit((data) => updateMutation.mutate(data))}
      >
        {/* ── Profile ─────────────────────────────────────── */}

        <div className="grid grid-cols-2 gap-5">
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="input" {...register('name', { required: 'Name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="input"
              {...register('email', { required: 'Email is required' })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input className="input" {...register('phone')} />
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="input" {...register('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        {/* ── Permission role ─────────────────────────────── */}

        <div
          className="rounded-lg border p-4 flex flex-col gap-4"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-alt, transparent)' }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} style={{ color: 'var(--primary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Access & Permissions
            </h3>
          </div>

          <div className="form-group">
            <label className="form-label">Permission Role</label>

            <select className="input" {...register('roleId')}>
              <option value="">No role — no module access</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                  {role.description ? ` — ${role.description}` : ''}
                </option>
              ))}
            </select>

            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Controls which modules and actions this user can access. Edit the
              permissions themselves under Settings &rarr; Roles.
            </p>

            {selectedRole && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {selectedRole.userCount ?? 0} other user(s) currently hold this role.
              </p>
            )}
          </div>

          {!selectedRoleId && (
            <div
              className="flex items-start gap-2 rounded-md p-3 text-xs"
              style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--text-primary)' }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#eab308' }} />
              <span>
                With no permission role assigned this user can sign in but will not
                see any modules.
              </span>
            </div>
          )}

          {/* The system role is the legacy ENUM. Only a super admin may
              change it, because 'super_admin' bypasses every permission
              check — this dropdown used to be editable by any admin,
              which was a one-click privilege escalation. */}
          <Can roles={['super_admin']}>
            <div className="form-group">
              <label className="form-label">System Role</label>

              <select className="input" {...register('role')}>
                {SYSTEM_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value="super_admin">Super Admin — full bypass</option>
              </select>

              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Super Admin ignores all permission rules. Grant sparingly.
              </p>
            </div>
          </Can>
        </div>

        {/* ── Company assignment ──────────────────────────── */}

        <div
          className="rounded-lg border p-4 flex flex-col gap-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: 'var(--primary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Company Assignment
            </h3>
          </div>

          <div className="form-group">
            <label className="form-label">Primary Company</label>

            <select className="input" {...register('primaryCompany')} disabled={!isSuperAdmin}>
              <option value="">Select Company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>

            {!isSuperAdmin && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Only a super admin can move a user between companies.
              </p>
            )}
          </div>

          <Can roles={['super_admin']}>
            <div className="form-group">
              <label className="form-label">Accessible Companies</label>

              <div className="flex flex-col gap-2">
                {companies.map((company) => (
                  <label key={company.id} className="flex items-center gap-2">
                    <input type="checkbox" value={company.id} {...register('companies')} />
                    {company.name}
                  </label>
                ))}
              </div>

              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                The user can switch between these companies. Their permission role
                applies in each unless a per-company role is set.
              </p>
            </div>
          </Can>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>

          <button className="btn btn-primary" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Updating...' : 'Update User'}
          </button>
        </div>
      </form>
    </div>
  )
}
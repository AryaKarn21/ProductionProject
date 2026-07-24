import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Building2, ShieldCheck, UserSearch, AlertTriangle } from 'lucide-react'

import { settingsAPI } from '@/api/settings.api'
import { rolesAPI } from '@/api/roles.api'
import { employeesAPI } from '@/api/employees.api'
import usePermission from '@/hooks/usePermission'
import { useAuthStore } from '@/store/auth.store'

/*
|--------------------------------------------------------------------------
| UserFormModal
|--------------------------------------------------------------------------
|
| Turns an existing HR employee into a CRM login account.
|
| Flow: Company -> Employee -> (auto-filled details) -> Permission Role
|
| Why it works this way:
|
|  - models/Employee.js already had a unique `userId` column and
|    index.js already declared Employee.belongsTo(User). The link
|    existed in the schema; nothing populated it. Selecting an employee
|    here is what finally closes that loop.
|
|  - Name / email / phone are read-only once an employee is chosen. The
|    server re-reads them from the Employee record anyway and ignores
|    whatever the browser sends, so editing them here would be
|    misleading.
|
|  - Employee.designation ("Sales Executive") and the CRM permission
|    role ("Manager") are separate concepts. Assigning a role never
|    touches the HR job title.
|
| Everything below is a convenience. The server independently verifies
| that the employee belongs to the company, that the role belongs to the
| company, that the actor may assign it, and that no duplicate account
| is created.
*/

const SYSTEM_ROLES = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'admin', label: 'Admin' },
]

export default function UserFormModal({ open, onClose }) {
  const queryClient = useQueryClient()
  const { isSuperAdmin } = usePermission()
  const activeCompany = useAuthStore((s) => s.activeCompany)
  const storeCompanies = useAuthStore((s) => s.companies) || []

  const [employeeSearch, setEmployeeSearch] = useState('')
  const [manualEntry, setManualEntry] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      employeeId: '',
      name: '',
      email: '',
      password: '',
      phone: '',
      role: 'employee',
      primaryCompany: '',
      roleId: '',
    },
  })

  const selectedCompany = watch('primaryCompany')
  const selectedEmployeeId = watch('employeeId')

  // ── Companies ────────────────────────────────────────────
  const {
    data: fetchedCompanies,
    isLoading: companiesLoading,
    isError: companiesError,
    error: companiesErrObj,
  } = useQuery({
    queryKey: ['companies'],
    queryFn: () => settingsAPI.getCompanies().then((r) => r.data),
    enabled: open,
  })

  const companies = Array.isArray(fetchedCompanies)
    ? fetchedCompanies
    : Array.isArray(fetchedCompanies?.companies)
      ? fetchedCompanies.companies
      : storeCompanies

  useEffect(() => {
    if (!open) return
    if (!isSuperAdmin && activeCompany) setValue('primaryCompany', activeCompany)
  }, [open, isSuperAdmin, activeCompany, setValue])

  // ── Employees for the chosen company ─────────────────────
  const {
    data: employeeData,
    isLoading: employeesLoading,
    isError: employeesError,
    error: employeesErrObj,
  } = useQuery({
    queryKey: ['employee-picker', selectedCompany, employeeSearch],
    queryFn: () =>
      employeesAPI
        .getForUserPicker({ companyId: selectedCompany, search: employeeSearch || undefined })
        .then((r) => r.data),
    enabled: open && !!selectedCompany,
  })

  const employees = employeeData?.employees || []
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)

  // Changing company invalidates the employee choice — otherwise you
  // could submit an employee from the previously selected company.
  useEffect(() => {
    setValue('employeeId', '')
    setEmployeeSearch('')
    setValue('name', '')
    setValue('email', '')
    setValue('phone', '')
    setValue('roleId', '')
  }, [selectedCompany, setValue])

  // Selecting an employee fills in their details.
  useEffect(() => {
    if (!selectedEmployee) return
    setValue('name', selectedEmployee.name || '')
    setValue('email', selectedEmployee.email || '')
    setValue('phone', selectedEmployee.phone || '')
  }, [selectedEmployeeId, selectedEmployee, setValue])

  // ── Roles for the chosen company ─────────────────────────
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles', 'assignable', selectedCompany],
    queryFn: () => rolesAPI.getAll({ status: 'active', limit: 100 }).then((r) => r.data),
    enabled: open && !!selectedCompany,
  })

  const roles = (rolesData?.roles || []).filter(
    (r) => !selectedCompany || String(r.companyId) === String(selectedCompany)
  )

  const createMutation = useMutation({
    mutationFn: (data) =>
      settingsAPI.createUser({
        ...data,
        employeeId: data.employeeId || undefined,
        roleId: data.roleId || undefined,
        companies: data.primaryCompany ? [data.primaryCompany] : [],
      }),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'User created successfully')
      queryClient.invalidateQueries({ queryKey: ['settings-users'] })
      queryClient.invalidateQueries({ queryKey: ['employee-picker'] })
      handleClose()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Unable to create user')
    },
  })

  const handleClose = () => {
    reset()
    setEmployeeSearch('')
    setManualEntry(false)
    onClose()
  }

  if (!open) return null

  const detailsLocked = !!selectedEmployeeId && !manualEntry

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,.5)' }}
    >
      <div className="card w-[560px] max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-bold mb-1">Add User</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          Give an existing employee access to the CRM.
        </p>

        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
          {/* ── 1. Company ─────────────────────────────────── */}
          <div>
            <label className="form-label">
              <span className="inline-flex items-center gap-1">
                <Building2 size={13} /> Company *
              </span>
            </label>
            <select
              className="input w-full"
              disabled={!isSuperAdmin || companiesLoading}
              {...register('primaryCompany', { required: 'Company is required' })}
            >
              <option value="">
                {companiesLoading ? 'Loading companies...' : 'Select a company'}
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {errors.primaryCompany && (
              <p className="text-red-500 text-xs mt-1">{errors.primaryCompany.message}</p>
            )}
            {companiesError && (
              <p className="text-red-500 text-xs mt-1">
                Could not load companies:{' '}
                {companiesErrObj?.response?.data?.message || companiesErrObj?.message}
              </p>
            )}
            {!isSuperAdmin && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                You can only add users to your own company.
              </p>
            )}
          </div>

          {/* ── 2. Employee ────────────────────────────────── */}
          <div
            className="rounded-lg border p-4 space-y-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <UserSearch size={15} style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-semibold">Employee</span>
            </div>

            <input
              className="input w-full"
              placeholder="Search by name, email or employee code..."
              value={employeeSearch}
              disabled={!selectedCompany}
              onChange={(e) => setEmployeeSearch(e.target.value)}
            />

            <select
              className="input w-full"
              disabled={!selectedCompany || employeesLoading}
              {...register('employeeId')}
            >
              <option value="">
                {!selectedCompany
                  ? 'Choose a company first'
                  : employeesLoading
                    ? 'Loading employees...'
                    : employees.length === 0
                      ? 'No employees available'
                      : 'Select an employee'}
              </option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.email ? `— ${e.email}` : ''}
                  {e.designation ? ` (${e.designation})` : ''}
                </option>
              ))}
            </select>

            {employeesError && (
              <p className="text-red-500 text-xs">
                {employeesErrObj?.response?.data?.message || employeesErrObj?.message}
              </p>
            )}

            {selectedCompany && !employeesLoading && employees.length === 0 && (
              <div
                className="flex items-start gap-2 rounded-md p-3 text-xs"
                style={{ background: 'rgba(234,179,8,0.1)' }}
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#eab308' }} />
                <span>
                  Every active employee in this company already has a CRM account, or
                  none have been added yet under Human Resources.
                </span>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={manualEntry}
                onChange={(e) => {
                  setManualEntry(e.target.checked)
                  if (e.target.checked) setValue('employeeId', '')
                }}
              />
              Create an account without linking an employee record
            </label>
          </div>

          {/* ── 3. Details ─────────────────────────────────── */}
          <div>
            <label className="form-label">Name *</label>
            <input
              className="input w-full"
              readOnly={detailsLocked}
              {...register('name', { required: 'Name is required' })}
            />
            {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
          </div>

          <div>
            <label className="form-label">Email *</label>
            <input
              type="email"
              className="input w-full"
              readOnly={detailsLocked}
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
          </div>

          <div>
            <label className="form-label">Phone</label>
            <input className="input w-full" readOnly={detailsLocked} {...register('phone')} />
            {detailsLocked && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Taken from the employee record. Edit it under Human Resources.
              </p>
            )}
          </div>

          <div>
            <label className="form-label">Password *</label>
            <input
              type="password"
              className="input w-full"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'At least 8 characters' },
              })}
            />
            {errors.password && (
              <p className="text-red-500 text-xs">{errors.password.message}</p>
            )}
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Minimum 8 characters, with an uppercase letter, a lowercase letter and a number.
            </p>
          </div>

          {/* ── 4. Access ──────────────────────────────────── */}
          <div
            className="rounded-lg border p-4 space-y-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-semibold">CRM Access</span>
            </div>

            <div>
              <label className="form-label">Permission Role *</label>
              <select
                className="input w-full"
                disabled={!selectedCompany || rolesLoading}
                {...register('roleId')}
              >
                <option value="">No role — no module access</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {!selectedCompany
                  ? 'Choose a company first.'
                  : rolesLoading
                    ? 'Loading roles...'
                    : roles.length === 0
                      ? 'This company has no roles yet. Create one under Roles & Permissions.'
                      : 'Decides which modules and actions this user can reach. Separate from their HR job title.'}
              </p>
            </div>

            <div>
              <label className="form-label">System Role</label>
              <select className="input w-full" {...register('role')}>
                {SYSTEM_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
                {/* Super Admin bypasses every permission check, so only a
                    super admin may create one. This used to be offered to
                    any admin — a one-click privilege escalation. */}
                {isSuperAdmin && <option value="super_admin">Super Admin — full bypass</option>}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn" onClick={handleClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
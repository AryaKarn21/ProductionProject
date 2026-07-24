import api from './axios'

export const settingsAPI = {
  // ── Companies ────────────────────────────────────────────
  getCompanies: () => api.get('/settings/companies'),

  // Settings.jsx calls addCompany(). createCompany is kept as an alias
  // so either name works.
  addCompany: (data) => api.post('/settings/companies', data),
  createCompany: (data) => api.post('/settings/companies', data),

  updateCompany: (id, data) => api.patch(`/settings/companies/${id}`, data),
  deleteCompany: (id) => api.delete(`/settings/companies/${id}`),

  // ── Users ────────────────────────────────────────────────
  getUsers: (params) => api.get('/settings/users', { params }),

  // NOTE: getUserById used to be declared TWICE in this object literal.
  // The second silently overwrote the first. Kept once.
  getUserById: (id) => api.get(`/settings/users/${id}`),

  createUser: (data) => api.post('/settings/users', data),
  updateUser: (id, data) => api.patch(`/settings/users/${id}`, data),
  deleteUser: (id) => api.delete(`/settings/users/${id}`),

  // ── User status ──────────────────────────────────────────
  // This endpoint used to be a silent no-op: it wrote a `status` column
  // that did not exist on the User model, so Sequelize dropped it and
  // the API still returned 200. models/User.js now declares `status`,
  // so activate/deactivate finally does something.
  changeUserStatus: (id, data) => api.patch(`/settings/users/${id}/status`, data),

  updateUserStatus: (id, status) =>
    api.patch(`/settings/users/${id}/status`, { status }),

  deactivateUser: (id) =>
    api.patch(`/settings/users/${id}/status`, { status: 'inactive' }),

  activateUser: (id) =>
    api.patch(`/settings/users/${id}/status`, { status: 'active' }),

  // ── Passwords ────────────────────────────────────────────
  // Changing your OWN password now requires currentPassword. An admin
  // resetting somebody else's may omit it.
  resetPassword: (id, data) => api.patch(`/settings/users/${id}/password`, data),
  updateUserPassword: (id, data) => api.patch(`/settings/users/${id}/password`, data),

  // ── Role assignment ──────────────────────────────────────
  // New. Before these existed there was no way at all to attach an RBAC
  // role to a user — roleId appeared nowhere in the frontend, so the
  // entire Roles & Permissions module was inert.

  /**
   * Assign a permission role.
   * @param {string} id      user id
   * @param {object} payload { roleId: string|null, companyId?: string }
   *
   * Pass companyId to set the role for that company only, so a user who
   * belongs to several companies can hold a different role in each.
   * Omit it to set their home role.
   */
  assignRole: (id, payload) => api.patch(`/settings/users/${id}/role`, payload),

  /**
   * Replace a user's company memberships.
   * @param {Array} memberships [{ companyId, roleId?, isPrimary? }]
   */
  setUserCompanies: (id, memberships) =>
    api.put(`/settings/users/${id}/companies`, { memberships }),

  /** Assign one role to many users at once. */
  bulkAssignRole: (userIds, roleId) =>
    api.post('/settings/users/bulk-assign-role', { userIds, roleId }),

  // ── Audit log ────────────────────────────────────────────
  // The Audit tab, AuditStatCards, AuditModuleChart and
  // PermissionMatrixDrawer all read through these.
  getAuditLogs: (params) => api.get('/audit-logs', { params }),
  getAuditStats: () => api.get('/audit-logs/stats'),
  exportAuditLogs: (params) =>
    api.get('/audit-logs/export', { params, responseType: 'blob' }),
}

export default settingsAPI
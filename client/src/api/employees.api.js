import api from "./axios";

export const employeesAPI = {
  getAll: (params) => api.get("/employees", { params }),

  /**
   * Slim employee list for the "Select Employee" dropdown in
   * Settings -> Users -> Add User.
   *
   * Reuses the Employee model behind GET /api/employees/picker rather
   * than shipping the full employee payload (salary, bank details, tax
   * numbers) to a dropdown.
   *
   * @param {object} params { companyId, search, unlinked }
   *   unlinked defaults to true server-side, hiding anyone who already
   *   has a CRM login.
   */
  getForUserPicker: (params) => api.get('/employees/picker', { params }),
  getById: (id) => api.get(`/employees/${id}`),
  getMe: () => api.get("/employees/me"),
  create: (data) => api.post("/employees", data),
  update: (id, data) => api.patch(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),

  // ── Quick Actions ────────────────────────────────────────────
  deactivate: (id, status) => api.patch(`/employees/${id}/deactivate`, { status }),
  assignShift: (id, shiftId) => api.patch(`/employees/${id}/assign-shift`, { shiftId }),
  assignManager: (id, reportingManagerId) =>
    api.patch(`/employees/${id}/assign-manager`, { reportingManagerId }),

  // ── Sub-resources (Employee Details tabs) ──────────────────
  getDashboardStats: (id) => api.get(`/employees/${id}/dashboard-stats`),
  getAttendance: (id, params) =>
    api.get(`/employees/${id}/attendance`, { params }),
  getLeaves: (id) => api.get(`/employees/${id}/leaves`),
  getPayslips: (id) => api.get(`/employees/${id}/payslips`),
  getTimeline: (id, params) => api.get(`/employees/${id}/timeline`, { params }),

  // ── Documents ──────────────────────────────────────────────
  getDocuments: (id) => api.get(`/employees/${id}/documents`),
  addDocument: (id, data) => api.post(`/employees/${id}/documents`, data),
  deleteDocument: (id, docId) =>
    api.delete(`/employees/${id}/documents/${docId}`),
  // kept for the multipart uploader, if you use it elsewhere
  uploadDocument: (id, formData) =>
    api.post(`/employees/${id}/documents`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  // ── Background: education & past work experience ───────────
  //
  // getBackground returns BOTH collections plus the server-computed
  // summary (total experience, highest qualification, how many rows
  // still need verifying). Use it rather than calling getEducations +
  // getExperiences and adding things up in the browser — that would be
  // a second implementation of the maths that can disagree with the
  // server's.
  getBackground: (id) => api.get(`/employees/${id}/background`),

  getEducations: (id) => api.get(`/employees/${id}/educations`),
  addEducation: (id, data) => api.post(`/employees/${id}/educations`, data),
  updateEducation: (id, eduId, data) =>
    api.patch(`/employees/${id}/educations/${eduId}`, data),
  deleteEducation: (id, eduId) =>
    api.delete(`/employees/${id}/educations/${eduId}`),
  // Separate endpoint, not a field on update: verification stamps who
  // and when, and requires admin/manager.
  verifyEducation: (id, eduId, isVerified = true) =>
    api.patch(`/employees/${id}/educations/${eduId}/verify`, { isVerified }),

  getExperiences: (id) => api.get(`/employees/${id}/experiences`),
  addExperience: (id, data) => api.post(`/employees/${id}/experiences`, data),
  updateExperience: (id, expId, data) =>
    api.patch(`/employees/${id}/experiences/${expId}`, data),
  deleteExperience: (id, expId) =>
    api.delete(`/employees/${id}/experiences/${expId}`),
  verifyExperience: (id, expId, isVerified = true) =>
    api.patch(`/employees/${id}/experiences/${expId}/verify`, { isVerified }),

  // ── Daily Reports ──────────────────────────────────────────
  getDailyReports: (id) => api.get(`/employees/${id}/daily-reports`),
  addDailyReport: (id, data) =>
    api.post(`/employees/${id}/daily-reports`, data),
  deleteDailyReport: (id, reportId) =>
    api.delete(`/employees/${id}/daily-reports/${reportId}`),

  // ── Send Email (through the backend mailer) ────────────────
  sendEmail: (id, data) => api.post(`/employees/${id}/send-email`, data),

  // ── Import / Export ────────────────────────────────────────
  exportEmployees: (params) =>
    api.get("/employees/export", { params, responseType: "blob" }),
  importEmployees: (formData) =>
    api.post("/employees/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  // Both names point at the same single-employee full-history export
  exportEmployeeProfile: (id) =>
    api.get(`/employees/${id}/export`, { responseType: "blob" }),
  exportFullHistory: (id) =>
    api.get(`/employees/${id}/export`, { responseType: "blob" }),

  // ── Performance (direct to the endpoint; no cross-import) ──
  updatePerformanceReview: (reviewId, data) =>
    api.patch(`/performance/${reviewId}`, data),
};
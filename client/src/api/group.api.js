import api from './axios'

/*
| Group Console — parent-company oversight.
|
| Every endpoint is read-only and scoped server-side to the companies
| BELOW the caller's own in the hierarchy (middleware/groupScope.js).
| Passing a companyId outside that scope returns 403, so the client never
| needs to filter for safety — only for presentation.
*/
export const groupAPI = {
  /**
   * Which companies this user can oversee, plus the org tree.
   * Call this first: it tells the UI whether to render the console or the
   * "no child companies yet" empty state.
   */
  getScope: () => api.get('/group/scope'),

  /**
   * Group-wide KPIs and the per-company breakdown table.
   * `params.pnlPeriod` (today | week | month | quarter | year) filters the
   * Profit/Loss column independently of `params.days`.
   */
  getOverview: (params) => api.get('/group/overview', { params }),

  /** Chronological cross-company activity feed. */
  getActivity: (params) => api.get('/group/activity', { params }),

  /** Volume by company / module / user, for the feed's charts. */
  getActivityStats: (params) => api.get('/group/activity/stats', { params }),

  /** CSV of the current filter. Requires group.export. */
  exportActivity: (params) =>
    api.get('/group/activity/export', { params, responseType: 'blob' }),

  /** Drill-down on one child company. */
  getCompany: (id) => api.get(`/group/companies/${id}`),
}

export default groupAPI
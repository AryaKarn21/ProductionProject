import api from './axios'

export const attendanceAPI = {
  getAll: (params) => api.get('/attendance', { params }),
  getById: (id) => api.get(`/attendance/${id}`),
  checkIn: (data) => api.post('/attendance/checkin', data),
  checkOut: (id) => api.patch(`/attendance/${id}/checkout`),
  update: (id, data) => api.patch(`/attendance/${id}`, data),
  getShifts: () => api.get('/attendance/shifts'),
  createShift: (data) => api.post('/attendance/shifts', data),
  updateShift: (id, data) => api.patch(`/attendance/shifts/${id}`, data),
  deleteShift: (id) => api.delete(`/attendance/shifts/${id}`),
  getSummary: (params) => api.get('/attendance/summary', { params }),
  getRegister: (params) => api.get('/attendance/register', { params }),
}
import api from "./axios";

export const holidayAPI = {
  getAll: (params = {}) =>
    api.get("/holidays", { params }),

  create: (data) =>
    api.post("/holidays", data),

  update: (id, data) =>
    api.patch(`/holidays/${id}`, data),

  remove: (id) =>
    api.delete(`/holidays/${id}`),
};

export default holidayAPI;
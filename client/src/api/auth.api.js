import api from "./axios";

export const authAPI = {
  login: (credentials) => api.post("/auth/login", credentials),
  register: (data) => api.post("/auth/register", data),
  verifyOTP: (data) => api.post("/auth/verify-otp", data),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),

  // The server now also accepts an optional single-use `token`. The OTP
  // path still works, but the OTP must be unexpired — previously ANY
  // verified OTP row, including one from signup months earlier, was a
  // standing permission to reset that account's password.
  resetPassword: (email, newPassword, token) =>
    api.post("/auth/reset-password", { email, newPassword, token }),

  logout: () => api.post("/auth/logout"),

  // Returns { user: { ..., permissions: ["leads.view", ...] }, companies }.
  // This was defined but NEVER CALLED, which is why permissions were
  // frozen at login time and a role change needed a logout to appear.
  getProfile: () => api.get("/auth/me"),

  updateProfile: async (data) => {
    const response = await api.put("/auth/profile", data);
    return response.data;
  },

  // This endpoint did not exist server-side until now — the call 404'd.
  // Body: { currentPassword, newPassword }. Returns a fresh token,
  // because changing the password signs out every other session.
  changePassword: (data) => api.put("/auth/change-password", data),

  uploadAvatar: (file) => {
    const formData = new FormData();
    formData.append("avatar", file);
    return api.post("/auth/avatar", formData, {
      headers: { "Content-Type": undefined },
    });
  },

  // Also missing server-side until now.
  removeAvatar: () => api.delete("/auth/avatar"),

  resendVerificationEmail: (email) => api.post("/auth/send-otp", { email }),
};

export default authAPI;
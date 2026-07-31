import api from "./axios";

/*
 * Turn a { to, cc, subject, ..., attachments: File[] } payload into a
 * multipart/form-data body when there are files to send, so it matches
 * what the backend's multer middleware (uploadEmailAttachment) expects.
 * Array fields (to/cc/bcc) become comma-separated strings — the backend's
 * parseAddressList() already splits on commas, so this round-trips fine.
 * When there are no attachments we still send plain JSON — no behavior
 * change for the existing no-attachment path.
 */
function toRequestBody(payload) {
  const { attachments, ...fields } = payload || {};

  if (!attachments || !attachments.length) {
    return { body: fields, headers: undefined };
  }

  const formData = new FormData();

  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    formData.append(
      key,
      Array.isArray(value) ? value.join(",") : value
    );
  });

  attachments.forEach((file) => {
    formData.append("attachments", file);
  });

  // Let the browser set Content-Type (with the multipart boundary) itself —
  // our axios instance defaults to application/json, which would break
  // multer's parsing if left in place for a FormData body.
  return { body: formData, headers: { "Content-Type": undefined } };
}

const emailAPI = {
  // ============================================================
  // EMAIL ACCOUNTS
  // ============================================================

  getAccounts: async () => {
    const { data } = await api.get("/email/accounts");
    return data;
  },

  getAccount: async (id) => {
    const { data } = await api.get(
      `/email/accounts/${id}`
    );

    return data;
  },

  createAccount: async (payload) => {
    const { data } = await api.post(
      "/email/accounts",
      payload
    );

    return data;
  },

  updateAccount: async (id, payload) => {
    const { data } = await api.patch(
      `/email/accounts/${id}`,
      payload
    );

    return data;
  },

  deleteAccount: async (id) => {
    const { data } = await api.delete(
      `/email/accounts/${id}`
    );

    return data;
  },

  setDefaultAccount: async (id) => {
    const { data } = await api.patch(
      `/email/accounts/${id}/set-default`
    );

    return data;
  },

   testConnection: async (id) => {
  const { data } = await api.post(
    `/email/accounts/${id}/test`
  );

  return data;
},

// ============================================================
// GOOGLE OAUTH (Gmail connect / disconnect / status)
// ============================================================

// Get Google OAuth URL
getGoogleAuthUrl: async () => {
  const { data } = await api.get("/email/google");
  return data; // { url }
},

// Get connected Google account
getGoogleAccount: async () => {
  const { data } = await api.get("/email/account");
  return data;
},

// Disconnect Google account
disconnectGoogle: async () => {
  const { data } = await api.post("/email/disconnect");
  return data;
},


  // ============================================================
  // SYNCHRONIZATION
  // ============================================================

  syncAccount: async (
    accountId,
    options = {}
  ) => {
    const { data } = await api.post(
      `/email/accounts/${accountId}/sync`,
      options
    );

    return data;
  },

  syncAccounts: async (
    options = {}
  ) => {
    const { data } = await api.post(
      "/email/sync",
      options
    );

    return data;
  },

  // ============================================================
  // MAILBOX
  // ============================================================

  getInbox: async ({
    page = 1,
    limit = 25,
    accountId,
    ...filters
  } = {}) => {
    const params = {
      page,
      limit,
      ...filters,
    };

    if (accountId) {
      params.accountId = accountId;
    }

    const { data } = await api.get(
      "/email/inbox",
      {
        params,
      }
    );

    return data;
  },

  getSent: async (params = {}) => {
    const { data } = await api.get(
      "/email/sent",
      {
        params,
      }
    );

    return data;
  },

  getDrafts: async (params = {}) => {
    const { data } = await api.get(
      "/email/drafts",
      {
        params,
      }
    );

    return data;
  },

  getTrash: async (params = {}) => {
    const { data } = await api.get(
      "/email/trash",
      {
        params,
      }
    );

    return data;
  },

  getSpam: async (params = {}) => {
    const { data } = await api.get(
      "/email/spam",
      {
        params,
      }
    );

    return data;
  },

  getArchive: async (
    params = {}
  ) => {
    const { data } = await api.get(
      "/email/archive",
      {
        params,
      }
    );

    return data;
  },

  getStarred: async (
    params = {}
  ) => {
    const { data } = await api.get(
      "/email/starred",
      {
        params,
      }
    );

    return data;
  },

  getEmail: async (id) => {
    const { data } = await api.get(
      `/email/${id}`
    );

    return data;
  },

  getHistory: async (params = {}) => {
    const { data } = await api.get(
      "/email/history",
      { params }
    );

    return data;
  },

  getRelatedEmails: async (params = {}) => {
    const { data } = await api.get(
      "/email/related",
      { params }
    );

    return data;
  },

  // ============================================================
  // TEMPLATES
  // ============================================================

  getTemplates: async (params = {}) => {
    const { data } = await api.get(
      "/email/templates",
      { params }
    );

    return data;
  },

  getTemplate: async (id) => {
    const { data } = await api.get(
      `/email/templates/${id}`
    );

    return data;
  },

  createTemplate: async (payload) => {
    const { data } = await api.post(
      "/email/templates",
      payload
    );

    return data;
  },

  updateTemplate: async (id, payload) => {
    const { data } = await api.patch(
      `/email/templates/${id}`,
      payload
    );

    return data;
  },

  deleteTemplate: async (id) => {
    const { data } = await api.delete(
      `/email/templates/${id}`
    );

    return data;
  },

  // ============================================================
  // COMPOSE
  // ============================================================

  sendEmail: async (payload) => {
    const { body, headers } = toRequestBody(payload);
    const { data } = await api.post(
      "/email/send",
      body,
      headers ? { headers } : undefined
    );

    return data;
  },

  saveDraft: async (payload) => {
    const { body, headers } = toRequestBody(payload);
    const { data } = await api.post(
      "/email/draft",
      body,
      headers ? { headers } : undefined
    );

    return data;
  },

  // ============================================================
  // MESSAGE ACTIONS
  // ============================================================

  replyEmail: async (
    id,
    payload
  ) => {
    const { data } = await api.post(
      `/email/${id}/reply`,
      payload
    );

    return data;
  },

  forwardEmail: async (
    id,
    payload
  ) => {
    const { data } = await api.post(
      `/email/${id}/forward`,
      payload
    );

    return data;
  },

  markAsRead: async (id) => {
    const { data } = await api.patch(
      `/email/${id}/read`
    );

    return data;
  },

  toggleStar: async (id) => {
    const { data } = await api.patch(
      `/email/${id}/star`
    );

    return data;
  },

  deleteEmail: async (id) => {
    const { data } = await api.delete(
      `/email/${id}`
    );

    return data;
  },
};

export default emailAPI;
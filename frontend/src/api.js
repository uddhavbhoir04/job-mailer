/**
 * Thin fetch wrapper around the backend API. Throws Error(message) on non-2xx.
 *
 * API_BASE: deployed builds call the backend URL from VITE_API_URL (e.g. on Render).
 * Empty in local dev, where Vite proxies /api to the local backend.
 */
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ---- password (stored in this browser only) ----
const KEY = 'jobMailerPassword';
export const auth = {
  get: () => {
    try {
      return localStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  },
  set: (pw) => {
    try {
      localStorage.setItem(KEY, pw);
    } catch {
      /* private mode: password lasts for this page load only */
    }
    memoryPassword = pw;
  },
  clear: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    memoryPassword = '';
  },
  onUnauthorized: () => {}, // replaced by App to show the login screen
};
let memoryPassword = '';
const password = () => memoryPassword || auth.get();

function headers(extra = {}) {
  const pw = password();
  return { ...extra, ...(pw ? { Authorization: `Bearer ${pw}` } : {}) };
}

async function request(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: headers(body ? { 'Content-Type': 'application/json' } : {}),
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) auth.onUnauthorized();
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const fileForm = (field, file) => {
  const f = new FormData();
  f.append(field, file);
  return f;
};

export const api = {
  health: () => request('/health'),
  /** Checks a password without saving it. */
  checkPassword: async (pw) => {
    const res = await fetch(`${API_BASE}/api/auth/check`, { headers: { Authorization: `Bearer ${pw}` } });
    return res.ok;
  },
  /** Fetches the stored resume with the auth header and returns a temporary object URL. */
  resumeBlobUrl: async () => {
    const res = await fetch(`${API_BASE}/api/resume/file`, { headers: headers() });
    if (!res.ok) throw new Error(res.status === 404 ? 'No resume uploaded' : `Could not load resume (${res.status})`);
    return URL.createObjectURL(await res.blob());
  },
  stats: () => request('/stats'),
  settings: () => request('/settings'),
  saveSettings: (s) => request('/settings', { method: 'PUT', body: s }),

  uploadRecords: (file) => request('/upload/records', { method: 'POST', form: fileForm('file', file) }),
  runOcr: () => request('/upload/records/ocr', { method: 'POST' }),

  recruiters: (params = {}) => request(`/recruiters?${new URLSearchParams(params)}`),
  addRecords: ({ records, text }) => request('/recruiters', { method: 'POST', body: { records, text } }),
  updateRecruiter: (id, data) => request(`/recruiters/${id}`, { method: 'PATCH', body: data }),
  deleteRecruiter: (id) => request(`/recruiters/${id}`, { method: 'DELETE' }),
  bulkDelete: (ids) => request('/recruiters/bulk-delete', { method: 'POST', body: { ids } }),
  unsubscribe: (id) => request(`/recruiters/${id}/unsubscribe`, { method: 'POST', body: {} }),

  suppressions: () => request('/suppressions'),
  addSuppression: (email) => request('/suppressions', { method: 'POST', body: { email } }),
  removeSuppression: (email) => request(`/suppressions/${encodeURIComponent(email)}`, { method: 'DELETE' }),

  resume: () => request('/resume'),
  uploadResume: (file) => request('/resume', { method: 'POST', form: fileForm('resume', file) }),
  deleteResume: () => request('/resume', { method: 'DELETE' }),

  // kind: 'main' (has title/company) | 'generic' (email-only rows)
  template: (kind = 'main') => request(`/templates/${kind}`),
  saveTemplate: (kind, t) => request(`/templates/${kind}`, { method: 'PUT', body: t }),
  resetTemplate: (kind) => request(`/templates/${kind}/reset`, { method: 'POST' }),
  preview: (recruiterId, template, kind) => request('/templates/preview', { method: 'POST', body: { recruiterId, template, kind } }),

  verifySmtp: () => request('/email/verify'),
  sendOne: (id, force = false) => request(`/email/send-one/${id}`, { method: 'POST', body: { confirm: true, force } }),
  sendBulk: (recruiterIds) => request('/email/send', { method: 'POST', body: { confirm: true, recruiterIds } }),

  campaign: () => request('/campaigns/current'),
  pause: () => request('/campaigns/pause', { method: 'POST' }),
  resumeCampaign: (campaignId) => request('/campaigns/resume', { method: 'POST', body: { campaignId } }),
  stop: () => request('/campaigns/stop', { method: 'POST' }),

  history: (params = {}) => request(`/history?${new URLSearchParams(params)}`),
};

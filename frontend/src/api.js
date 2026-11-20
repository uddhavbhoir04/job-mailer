/** Thin fetch wrapper around the backend API. Throws Error(message) on non-2xx. */
async function request(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
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
  stats: () => request('/stats'),
  settings: () => request('/settings'),
  saveSettings: (s) => request('/settings', { method: 'PUT', body: s }),

  uploadRecords: (file) => request('/upload/records', { method: 'POST', form: fileForm('file', file) }),
  runOcr: () => request('/upload/records/ocr', { method: 'POST' }),

  recruiters: (params = {}) => request(`/recruiters?${new URLSearchParams(params)}`),
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

  template: () => request('/templates/default'),
  saveTemplate: (t) => request('/templates/default', { method: 'PUT', body: t }),
  resetTemplate: () => request('/templates/reset', { method: 'POST' }),
  preview: (recruiterId, template) => request('/templates/preview', { method: 'POST', body: { recruiterId, template } }),

  verifySmtp: () => request('/email/verify'),
  sendOne: (id, force = false) => request(`/email/send-one/${id}`, { method: 'POST', body: { confirm: true, force } }),
  sendBulk: (recruiterIds) => request('/email/send', { method: 'POST', body: { confirm: true, recruiterIds } }),

  campaign: () => request('/campaigns/current'),
  pause: () => request('/campaigns/pause', { method: 'POST' }),
  resumeCampaign: (campaignId) => request('/campaigns/resume', { method: 'POST', body: { campaignId } }),
  stop: () => request('/campaigns/stop', { method: 'POST' }),

  history: (params = {}) => request(`/history?${new URLSearchParams(params)}`),
};

const TOKEN_KEY = 'token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

let socketId = null;
export const setSocketId = (id) => {
  socketId = id;
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body || {};
  }
}

const BASE = import.meta.env.VITE_API_URL || '';

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (socketId) headers['X-Socket-Id'] = socketId;

  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { error: 'Network error: unable to reach the server' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}

export const notesApi = {
  list: (params, signal) => api(`/notes?${new URLSearchParams(params)}`, { signal }),
  get: (id) => api(`/notes/${id}`),
  create: (fields = {}) => api('/notes', { method: 'POST', body: fields }),
  update: (id, fields) => api(`/notes/${id}`, { method: 'PUT', body: fields }),
  remove: (id) => api(`/notes/${id}`, { method: 'DELETE' }),
  favorite: (id, favorite) => api(`/notes/${id}/favorite`, { method: 'PATCH', body: { favorite } }),
  share: (id, email, permission) => api(`/notes/${id}/collaborators`, { method: 'POST', body: { email, permission } }),
  setPermission: (id, userId, permission) =>
    api(`/notes/${id}/collaborators/${userId}`, { method: 'PATCH', body: { permission } }),
  unshare: (id, userId) => api(`/notes/${id}/collaborators/${userId}`, { method: 'DELETE' }),
};

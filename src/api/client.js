const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getToken() {
  return localStorage.getItem('token');
}

// Wrapper de fetch: arma la URL, pone el token si hay, manda/recibe JSON,
// y si el server dice que el token vencio (401) limpia sesion y manda al login.
async function request(path, { method = 'GET', body, params } = {}) {
  let url = `${BASE_URL}${path}`;
  if (params) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (query) url += `?${query}`;
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // Si se cae el wifi o el server no responde, fetch tira un TypeError
  // ("Failed to fetch") bastante críptico. Lo traducimos a un mensaje claro
  // para que, en cualquier pantalla, el toast/error diga algo útil en vez
  // de "Failed to fetch".
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Sin conexión con el servidor. Revisá tu internet e intentá de nuevo.');
  }

  if (res.status === 401) {
    localStorage.removeItem('token');
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Sesion vencida');
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    if (!res.ok) throw new Error('No se pudo generar el PDF');
    return res.blob();
  }

  const data = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    throw new Error(data?.error || `Error ${res.status}`);
  }
  return data;
}

export const api = {
  get: (path, params) => request(path, { method: 'GET', params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export default api;

const API = '/api';

/** Customer / Host / Admin alag token — same link par dono login clash nahi karenge */
function getAuthPrefix() {
  const p = window.location.pathname || '';
  if (p.includes('/agent')) return 'host';
  if (p.includes('/admin')) return 'admin';
  return 'customer';
}

function tokenKey() {
  return `${getAuthPrefix()}_token`;
}

function userKey() {
  return `${getAuthPrefix()}_user`;
}

function getToken() {
  const prefix = getAuthPrefix();
  let t = localStorage.getItem(`${prefix}_token`);
  if (t) return t;
  // purana shared token (ek baar migrate)
  const legacy = localStorage.getItem('token');
  const legacyUser = getLegacyUser();
  if (!legacy) return null;
  const role = legacyUser?.role;
  if (prefix === 'host' && role === 'agent') {
    localStorage.setItem('host_token', legacy);
    localStorage.setItem('host_user', JSON.stringify(legacyUser));
    return legacy;
  }
  if (prefix === 'customer' && role === 'customer') {
    localStorage.setItem('customer_token', legacy);
    localStorage.setItem('customer_user', JSON.stringify(legacyUser));
    return legacy;
  }
  if (prefix === 'admin' && (role === 'admin' || role === 'super_admin')) {
    localStorage.setItem('admin_token', legacy);
    localStorage.setItem('admin_user', JSON.stringify(legacyUser));
    return legacy;
  }
  return null;
}

function getLegacyUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

function setAuth(token, user) {
  localStorage.setItem(tokenKey(), token);
  if (user) localStorage.setItem(userKey(), JSON.stringify(user));
}

function getUser() {
  try {
    const prefix = getAuthPrefix();
    const u = localStorage.getItem(userKey());
    if (u) return JSON.parse(u);
    const legacy = getLegacyUser();
    if (!legacy) return null;
    if (prefix === 'customer' && legacy.role === 'customer') return legacy;
    if (prefix === 'host' && legacy.role === 'agent') return legacy;
    if (prefix === 'admin' && (legacy.role === 'admin' || legacy.role === 'super_admin')) return legacy;
    return null;
  } catch {
    return null;
  }
}

function logout() {
  const prefix = getAuthPrefix();
  localStorage.removeItem(`${prefix}_token`);
  localStorage.removeItem(`${prefix}_user`);
  if (prefix === 'host') localStorage.removeItem('host_agent');
  location.reload();
}

async function parseResponse(res) {
  if (res.status === 413) {
    throw new Error('Photo too large — use a smaller image or try again');
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (text.includes('Cannot PATCH') || text.includes('Cannot PUT')) {
      throw new Error('Server needs restart — run: node server/index.js');
    }
    if (text.includes('<!DOCTYPE')) {
      throw new Error(`Server error (${res.status}) — reload the page`);
    }
    throw new Error(text.slice(0, 120) || `Request failed (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const skipAuth = options.skipAuth || path.startsWith('/auth/login') || path.startsWith('/auth/forgot') || path.startsWith('/auth/reset');
  const token = skipAuth ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const timeoutMs = options.timeoutMs ?? 45000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    return await parseResponse(res);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Server is slow — wait and try again');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Login without sending old token (fixes stuck sessions) */
async function authLogin(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: (email || '').trim().toLowerCase(), password }),
  });
  return parseResponse(res);
}

function clearPortalAuth() {
  const prefix = getAuthPrefix();
  localStorage.removeItem(`${prefix}_token`);
  localStorage.removeItem(`${prefix}_user`);
  if (prefix === 'host') localStorage.removeItem('host_agent');
}

async function validateSession(expectedRole) {
  const token = getToken();
  if (!token) return false;
  try {
    const data = await api('/auth/me');
    if (expectedRole && data.user?.role !== expectedRole) return false;
    setAuth(token, data.user);
    return true;
  } catch {
    clearPortalAuth();
    return false;
  }
}

window.authLogin = authLogin;
window.clearPortalAuth = clearPortalAuth;
window.validateSession = validateSession;

function setButtonLoading(btn, loading, label) {
  if (!btn) return;
  if (loading) {
    btn.dataset.prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = label || 'Please wait...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.prevText || btn.textContent;
  }
}

function socketOpts() {
  const host = window.location.hostname || '';
  const viaTunnel = host.includes('trycloudflare.com') || host.includes('ngrok');
  return {
    auth: { token: getToken() },
    path: '/socket.io',
    transports: viaTunnel ? ['polling'] : ['polling', 'websocket'],
    upgrade: !viaTunnel,
    rememberUpgrade: false,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 30000,
  };
}

function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;padding:12px 20px;background:#1a1a2e;border:2px solid ' +
    (isError ? '#ef4444' : '#22c55e') +
    ';color:#fff;border-radius:10px;font-size:0.9rem;max-width:90vw;text-align:center';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.display = 'block';
  } else {
    toast(msg, true);
  }
}

function clearLoginError() {
  const el = document.getElementById('login-error');
  if (el) {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

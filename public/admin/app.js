const $ = (id) => document.getElementById(id);

let myPerms = {};
let myRole = '';
let currentTab = 'dashboard';
const openAccordions = new Set(['host', 'settings']);

const ICONS = {
  grid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  mic: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  phone: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  gift: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  wallet: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
  plan: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  chart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

/** Flirtzy-style menu with accordions */
const NAV_MENU = [
  { type: 'link', tab: 'dashboard', icon: 'grid', label: 'Dashboard', perm: 'dashboard' },
  { type: 'link', tab: 'users', icon: 'user', label: 'User', perm: 'users' },
  {
    type: 'accordion', id: 'host', icon: 'mic', label: 'Host',
    permAny: ['agents', 'pending'],
    children: [
      { tab: 'agents', label: 'All Host', perm: 'agents' },
      { tab: 'pending', label: 'Host Request', perm: 'pending' },
    ],
  },
  { type: 'link', tab: 'create', icon: 'plus', label: 'Create Account', perm: 'create_accounts', altPerm: 'create_user' },
  { type: 'link', tab: 'calls', icon: 'phone', label: 'Call History', perm: 'calls' },
  {
    type: 'accordion', id: 'gift', icon: 'gift', label: 'Gift',
    perm: 'messages',
    children: [{ tab: 'messages', label: 'Messages & Gifts', perm: 'messages' }],
  },
  { type: 'link', tab: 'withdrawals', icon: 'wallet', label: 'Withdraw', superOnly: true },
  {
    type: 'accordion', id: 'plan', icon: 'plan', label: 'Plan',
    superOnly: true,
    children: [{ tab: 'rates', label: 'Coin Plan / Rates', superOnly: true }],
  },
  {
    type: 'accordion', id: 'settings', icon: 'settings', label: 'Settings',
    superOnly: true,
    children: [
      { tab: 'payment', label: 'Payment Gateway', superOnly: true },
      { tab: 'sms', label: 'SMS API', superOnly: true },
      { tab: 'notifications', label: 'Notifications', superOnly: true },
      { tab: 'platform', label: 'App Features', superOnly: true },
      { tab: 'manage-admins', label: 'Manage Admins', superOnly: true },
    ],
  },
  { type: 'link', tab: 'reports', icon: 'chart', label: 'Reports', perm: 'reports' },
];

const PERM_LABELS = {
  dashboard: 'Dashboard', users: 'Users', agents: 'Hosts', pending: 'Pending Approve',
  withdrawals: 'Withdrawals', calls: 'Calls', messages: 'Messages', reports: 'Reports',
  create_user: 'Create User', create_host: 'Create Host', create_accounts: 'Create Account',
  payment_gateway: 'Payment', sms_settings: 'SMS', notifications: 'Notifications',
  manage_admins: 'Manage Admins', platform_settings: 'App Features', rates_settings: 'Rates',
};

const TAB_TITLES = {
  dashboard: 'Dashboard', users: 'User', agents: 'All Host', pending: 'Host Request',
  create: 'Create Account', calls: 'Call History', messages: 'Messages & Gifts',
  withdrawals: 'Withdraw', rates: 'Coin Plan', payment: 'Payment Gateway',
  sms: 'SMS API', notifications: 'Notifications', platform: 'App Features',
  'manage-admins': 'Manage Admins', reports: 'Reports',
};

function hasPerm(perm, altPerm) {
  if (myRole === 'super_admin') return true;
  if (altPerm && (myPerms[perm] || myPerms[altPerm])) return true;
  return !!myPerms[perm];
}

function canSeeItem(item) {
  if (item.superOnly && myRole !== 'super_admin') return false;
  if (item.type === 'accordion') {
    if (item.superOnly) return myRole === 'super_admin';
    const kids = (item.children || []).filter(canSeeChild);
    return kids.length > 0;
  }
  if (myRole === 'super_admin') return true;
  if (item.altPerm) return hasPerm(item.perm, item.altPerm);
  return hasPerm(item.perm);
}

function canSeeChild(child) {
  if (child.superOnly && myRole !== 'super_admin') return false;
  if (myRole === 'super_admin') return true;
  return hasPerm(child.perm);
}

function accordionForTab(tab) {
  for (const item of NAV_MENU) {
    if (item.type === 'accordion' && item.children?.some((c) => c.tab === tab)) return item.id;
  }
  return null;
}

function buildNav() {
  const nav = $('sidebar-nav');
  let html = '';
  let firstTab = null;

  NAV_MENU.forEach((item) => {
    if (!canSeeItem(item)) return;

    if (item.type === 'link') {
      if (!firstTab) firstTab = item.tab;
      const superTag = item.superOnly && myRole === 'super_admin' ? '' : '';
      html += `<button type="button" class="nav-item" data-tab="${item.tab}">
        <span class="nav-icon">${ICONS[item.icon] || ''}</span>
        <span>${item.label}${superTag}</span>
      </button>`;
      return;
    }

    if (item.type === 'accordion') {
      const visibleKids = item.children.filter(canSeeChild);
      if (!visibleKids.length) return;
      if (!firstTab) firstTab = visibleKids[0].tab;
      const isOpen = openAccordions.has(item.id);
      html += `<div class="nav-group" data-group="${item.id}">
        <button type="button" class="nav-group-header ${isOpen ? 'open' : ''}" data-accordion="${item.id}">
          <span class="nav-icon">${ICONS[item.icon] || ''}</span>
          <span>${item.label}</span>
          <span class="chevron">›</span>
        </button>
        <div class="nav-submenu ${isOpen ? 'open' : ''}" id="submenu-${item.id}">
          ${visibleKids.map((c) => `
            <button type="button" class="nav-subitem" data-tab="${c.tab}">${c.label}</button>
          `).join('')}
        </div>
      </div>`;
    }
  });

  if (myRole === 'super_admin') {
    html += `<div style="padding:12px 20px 0;font-size:0.7rem;color:#64748b">Role: Super Admin <span class="super-badge">OWNER</span></div>`;
  }

  nav.innerHTML = html;

  nav.querySelectorAll('.nav-item, .nav-subitem').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      if (window.innerWidth <= 900) $('sidebar').classList.remove('mobile-open');
    });
  });

  nav.querySelectorAll('.nav-group-header').forEach((btn) => {
    btn.addEventListener('click', () => toggleAccordion(btn.dataset.accordion));
  });

  if (firstTab) switchTab(firstTab);
}

function toggleAccordion(id) {
  const sub = $(`submenu-${id}`);
  const header = document.querySelector(`[data-accordion="${id}"]`);
  if (!sub) return;
  const open = sub.classList.toggle('open');
  header?.classList.toggle('open', open);
  if (open) openAccordions.add(id);
  else openAccordions.delete(id);
}

function updateNavActive(tab) {
  document.querySelectorAll('.nav-item, .nav-subitem').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  const accId = accordionForTab(tab);
  if (accId && !openAccordions.has(accId)) {
    openAccordions.add(accId);
    const sub = $(`submenu-${accId}`);
    const header = document.querySelector(`[data-accordion="${accId}"]`);
    sub?.classList.add('open');
    header?.classList.add('open');
  }
}

function ensurePanel(id) {
  let el = $(`panel-${id}`);
  if (!el) {
    el = document.createElement('div');
    el.id = `panel-${id}`;
    el.className = 'hidden';
    $('admin-panels').appendChild(el);
  }
  return el;
}

const ALL_TABS = [
  'dashboard', 'users', 'agents', 'pending', 'create', 'calls', 'messages',
  'withdrawals', 'rates', 'payment', 'sms', 'notifications', 'platform',
  'manage-admins', 'reports',
];

function switchTab(tab) {
  currentTab = tab;
  updateNavActive(tab);
  $('breadcrumb-current').textContent = TAB_TITLES[tab] || tab;
  ALL_TABS.forEach((t) => ensurePanel(t).classList.toggle('hidden', t !== tab));
  if (tab === 'dashboard') loadStats();
  else loadTab(tab);
}

$('btn-login').onclick = async () => {
  const err = $('login-error');
  err.classList.add('hidden');
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('login-email').value.trim(), password: $('login-password').value }),
    });
    if (data.user.role !== 'admin' && data.user.role !== 'super_admin') throw new Error('Admin login only');
    setAuth(data.token, data.user);
    localStorage.setItem('permissions', JSON.stringify(data.permissions || {}));
    myPerms = data.permissions || {};
    myRole = data.user.role;
    showMain();
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
  }
};

$('btn-logout').onclick = logout;

$('menu-toggle')?.addEventListener('click', () => {
  if (window.innerWidth <= 900) {
    $('sidebar').classList.toggle('mobile-open');
  } else {
    $('sidebar').classList.toggle('collapsed');
    $('admin-main').classList.toggle('sidebar-hidden');
  }
});

async function loadStats() {
  const s = await api('/admin/stats');
  ensurePanel('dashboard').innerHTML = `
    <h1 class="page-heading">Hi, Welcome back!</h1>
    <div class="admin-stats">
      <div class="stat-card"><div class="stat-icon blue">👤</div><div><div class="stat-label">Total User</div><div class="stat-value">${s.customers}</div></div></div>
      <div class="stat-card"><div class="stat-icon pink">🎤</div><div><div class="stat-label">Total Host</div><div class="stat-value">${s.approved_agents}</div></div></div>
      <div class="stat-card"><div class="stat-icon yellow">⏳</div><div><div class="stat-label">Pending Host</div><div class="stat-value">${s.pending_agents}</div></div></div>
      <div class="stat-card"><div class="stat-icon green">📞</div><div><div class="stat-label">Total Calls</div><div class="stat-value">${s.total_calls}</div></div></div>
      <div class="stat-card"><div class="stat-icon purple">💰</div><div><div class="stat-label">Pending Payout</div><div class="stat-value">${s.pending_withdrawals}</div></div></div>
      <div class="stat-card"><div class="stat-icon cyan">💵</div><div><div class="stat-label">Total Revenue</div><div class="stat-value">₹${Number(s.platform_revenue).toFixed(0)}</div></div></div>
    </div>
    <div class="admin-panel-card">
      <div class="card-head">Overview</div>
      <div class="card-body">
        ${myRole === 'super_admin'
    ? '<strong style="color:#ff2d78">Super Admin</strong> — full control: users, hosts, withdrawals, payment API, SMS, notifications, employee permissions.'
    : '<strong>Employee Admin</strong> — only menus enabled by Super Admin. Withdrawals & payment settings are hidden.'}
      </div>
    </div>`;
}

function avatarImg(url, size = 40) {
  const src = url || 'https://i.pravatar.cc/150?img=5';
  return `<img src="${src}" class="admin-avatar-thumb" style="width:${size}px;height:${size}px" onerror="this.src='https://i.pravatar.cc/150?img=5'">`;
}

function closeAdminModal() {
  document.getElementById('admin-edit-overlay')?.remove();
}

function openAdminModal(title, bodyHtml, onSave) {
  closeAdminModal();
  const overlay = document.createElement('div');
  overlay.id = 'admin-edit-overlay';
  overlay.className = 'admin-edit-overlay';
  overlay.innerHTML = `
    <div class="admin-edit-modal">
      <div class="admin-edit-head">
        <h3>${title}</h3>
        <button type="button" class="admin-edit-close" onclick="closeAdminModal()">✕</button>
      </div>
      <div class="admin-edit-body">${bodyHtml}</div>
      <div class="admin-edit-foot">
        <button type="button" class="btn-admin outline" onclick="closeAdminModal()">Cancel</button>
        <button type="button" class="btn-admin success" id="admin-edit-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAdminModal(); });
  $('admin-edit-save').onclick = onSave;
}

function bindPhotoPicker(inputId, previewId, onData) {
  const input = $(inputId);
  if (!input) return;
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return toast('Please choose an image file', true);
    try {
      const data = typeof cropPortraitForProfile === 'function'
        ? await cropPortraitForProfile(file)
        : await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
      onData(data);
      if ($(previewId)) $(previewId).src = data;
      const preview = document.querySelector('#admin-edit-overlay .admin-avatar-thumb');
      if (preview) preview.src = data;
    } catch (err) {
      toast(err.message, true);
      e.target.value = '';
    }
  };
}

function hostTable(agents, isPending) {
  if (!agents.length) return '<p style="color:#64748b;padding:12px 0">No records found</p>';
  return `<div style="overflow-x:auto"><table class="admin-table"><thead><tr>
    <th>Host</th><th>Phone</th><th>Status</th><th>Rates (₹/min)</th><th>Actions</th>
  </tr></thead><tbody>
    ${agents.map((a) => `<tr>
      <td>${avatarImg(a.photo_url, 44)}
        <strong>${a.display_name}</strong><br><small style="color:#64748b">${a.email}</small></td>
      <td>${a.phone || '—'}</td>
      <td><span class="badge-pill ${a.status}">${a.status}</span></td>
      <td>A: <input class="rate-input" id="audio-${a.id}" value="${a.audio_rate}"> V: <input class="rate-input" id="video-${a.id}" value="${a.video_rate}"></td>
      <td class="admin-row-actions">
        <button class="btn-admin btn-blue" onclick="editHost('${a.id}')">Edit</button>
        ${isPending ? `
        <button class="btn-admin outline" onclick="viewVerify('${a.id}')">Verify</button>
        <button class="btn-admin success" onclick="approveAgent('${a.id}')">Approve</button>
        <button class="btn-admin danger" onclick="rejectAgent('${a.id}')">Reject</button>` : `
        <button class="btn-admin outline" onclick="toggleHostOnline('${a.id}',${!a.is_online})">${a.is_online ? 'Force Off' : 'Online'}</button>
        <button class="btn-admin outline" onclick="saveRates('${a.id}')">Save rates</button>`}
      </td></tr>`).join('')}
  </tbody></table></div>`;
}

function pageShell(title, body, searchPlaceholder) {
  const search = searchPlaceholder
    ? `<div class="search-box"><input type="search" placeholder="${searchPlaceholder}" id="table-search"><button type="button">🔍</button></div>`
    : '';
  return `
    <h1 class="page-heading">${title}</h1>
    <div class="toolbar">${search}<div></div></div>
    <div class="admin-panel-card"><div class="card-body">${body}</div></div>`;
}

async function loadTab(tab) {
  const panel = ensurePanel(tab);

  if (tab === 'create') {
    const roleOpts = myRole === 'super_admin'
      ? '<option value="customer">User</option><option value="host">Host</option><option value="admin">Admin (Employee)</option>'
      : '<option value="customer">User</option><option value="host">Host</option>';
    panel.innerHTML = pageShell('Create Account', `
      <div class="form-grid">
        <div><label>Role *</label><select id="ca-role" onchange="toggleCreateFields()">${roleOpts}</select></div>
        <div><label>Full Name *</label><input id="ca-name" placeholder="Name"></div>
        <div><label>Email *</label><input id="ca-email" type="email"></div>
        <div><label>Phone</label><input id="ca-phone"></div>
        <div><label>Password *</label><input id="ca-pass" type="password"></div>
        <div id="field-wallet"><label>Starting Wallet ₹</label><input id="ca-wallet" type="number" value="100"></div>
        <div id="field-display" class="hidden"><label>Display Name</label><input id="ca-display"></div>
        <div id="field-age" class="hidden"><label>Age</label><input id="ca-age" type="number" value="22"></div>
        <div id="field-audio" class="hidden"><label>Audio ₹/min</label><input id="ca-audio" type="number" value="5"></div>
        <div id="field-video" class="hidden"><label>Video ₹/min</label><input id="ca-video" type="number" value="20"></div>
      </div>
      <p id="field-host-extra" class="hidden" style="margin:14px 0"><label><input type="checkbox" id="ca-auto" checked> Auto-approve host</label></p>
      <button class="btn-add" onclick="createAccount()">+ Create</button>`);
    window.toggleCreateFields();
    return;
  }

  if (tab === 'users') {
    const users = await api('/admin/users');
    panel.innerHTML = pageShell('User', `
      <table class="admin-table"><thead><tr><th>Photo</th><th>Name</th><th>Email</th><th>Phone</th><th>Coin</th><th>Block</th><th>Edit</th></tr></thead><tbody>
      ${users.map((u) => `<tr>
        <td>${avatarImg(u.photo_url, 44)}</td>
        <td><strong>${u.name || '—'}</strong>${u.gender ? `<br><small style="color:#64748b">${u.gender}</small>` : ''}</td>
        <td>${u.email}</td>
        <td>${u.phone || '—'}</td>
        <td>🪙 ${u.wallet_balance}</td>
        <td><span class="toggle-switch ${u.is_blocked ? '' : 'on'}" onclick="blockUser('${u.id}',${!u.is_blocked})"></span></td>
        <td><button class="btn-admin btn-blue" onclick="editUser('${u.id}')">Edit</button></td>
      </tr>`).join('') || '<tr><td colspan="7">No users</td></tr>'}
      </tbody></table>`, 'Search user...');
  }

  if (tab === 'agents' || tab === 'pending') {
    const agents = await api(`/admin/agents${tab === 'pending' ? '?status=pending' : ''}`);
    panel.innerHTML = pageShell(TAB_TITLES[tab], hostTable(agents, tab === 'pending'));
  }

  if (tab === 'withdrawals') {
    const list = await api('/admin/withdrawals');
    panel.innerHTML = pageShell('Withdraw', `
      <p style="color:#64748b;margin-bottom:14px">Super Admin only — approve host payout requests.</p>
      <table class="admin-table"><thead><tr><th>Host</th><th>Gross</th><th>Fee</th><th>Net</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${list.map((w) => `<tr><td>${w.display_name}<br><small>${w.email}</small></td><td>₹${w.gross_amount}</td><td>₹${w.platform_fee}</td><td><strong>₹${w.net_amount}</strong></td>
      <td><span class="badge-pill ${w.status}">${w.status}</span></td>
      <td>${w.status === 'pending' ? `<button class="btn-admin success" onclick="updateWithdrawal('${w.id}','paid')">Paid</button>
        <button class="btn-admin danger" onclick="updateWithdrawal('${w.id}','rejected')">Reject</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="6">No withdrawals</td></tr>'}
      </tbody></table>`);
  }

  if (tab === 'calls') {
    const calls = await api('/admin/calls');
    panel.innerHTML = pageShell('Call History', `<table class="admin-table">
      <thead><tr><th>User</th><th>Host</th><th>Type</th><th>Charge</th><th>Host Earn</th><th>Platform</th></tr></thead>
      <tbody>${calls.map((c) => `<tr><td>${c.customer_name}</td><td>${c.agent_name}</td><td>${c.call_type}</td><td>₹${c.total_charge || 0}</td><td>₹${c.agent_earning || 0}</td><td>₹${c.platform_fee || 0}</td></tr>`).join('')}</tbody></table>`);
  }

  if (tab === 'messages') {
    const msgs = await api('/admin/messages');
    panel.innerHTML = pageShell('Messages & Gifts', `<table class="admin-table">
      <thead><tr><th>User</th><th>Host</th><th>Type</th><th>Content</th><th>₹</th></tr></thead>
      <tbody>${msgs.map((m) => `<tr><td>${m.customer_name}</td><td>${m.agent_name}</td><td>${m.msg_type || 'text'}</td><td>${m.body}</td><td>${m.gift_charge || 0}</td></tr>`).join('')}</tbody></table>`);
  }

  if (tab === 'reports') {
    const s = await api('/admin/stats');
    panel.innerHTML = pageShell('Reports', `
      <p>Revenue: <strong style="color:#ff2d78">₹${Number(s.platform_revenue).toFixed(2)}</strong></p>
      <p style="margin-top:8px">Calls: ${s.total_calls} · Users: ${s.customers} · Hosts: ${s.approved_agents}</p>`);
  }

  if (tab === 'payment') await loadPaymentSettings(panel);
  if (tab === 'sms') await loadSmsSettings(panel);
  if (tab === 'notifications') await loadNotifSettings(panel);
  if (tab === 'rates') await loadRatesSettings(panel);
  if (tab === 'platform') await loadPlatformFeatures(panel);
  if (tab === 'manage-admins') await loadManageAdmins(panel);
}

window.toggleCreateFields = function () {
  const role = $('ca-role')?.value;
  $('field-wallet')?.classList.toggle('hidden', role !== 'customer');
  $('field-display')?.classList.toggle('hidden', role !== 'host');
  $('field-age')?.classList.toggle('hidden', role !== 'host');
  $('field-audio')?.classList.toggle('hidden', role !== 'host');
  $('field-video')?.classList.toggle('hidden', role !== 'host');
  $('field-host-extra')?.classList.toggle('hidden', role !== 'host');
};

window.createAccount = async function () {
  const role = $('ca-role').value;
  const body = {
    role: role === 'host' ? 'agent' : role,
    name: $('ca-name').value,
    email: $('ca-email').value,
    phone: $('ca-phone').value,
    password: $('ca-pass').value,
    wallet_balance: $('ca-wallet')?.value,
    display_name: $('ca-display')?.value,
    age: $('ca-age')?.value,
    audio_rate: $('ca-audio')?.value,
    video_rate: $('ca-video')?.value,
    auto_approve: $('ca-auto')?.checked,
  };
  try {
    const r = await api('/admin/create-account', { method: 'POST', body: JSON.stringify(body) });
    alert(r.message + '\nEmail: ' + body.email);
  } catch (e) {
    alert(e.message);
  }
};

async function loadPaymentSettings(panel) {
  const settings = await api('/super-admin/settings');
  const pg = settings.find((s) => s.setting_key === 'payment_gateway')?.value || {};
  panel.innerHTML = pageShell('Payment Gateway', `
    <div class="form-grid">
      <div><label>Provider</label><select id="pg-provider"><option value="razorpay">Razorpay</option><option value="paytm">Paytm</option><option value="phonepe">PhonePe</option></select></div>
      <div><label>Key ID</label><input id="pg-key" value="${pg.key_id || ''}"></div>
      <div><label>Key Secret</label><input id="pg-secret" type="password" value="${pg.key_secret || ''}"></div>
      <div><label>Webhook Secret</label><input id="pg-webhook" value="${pg.webhook_secret || ''}"></div>
      <div><label><input type="checkbox" id="pg-enabled" ${pg.enabled ? 'checked' : ''}> Enabled</label></div>
    </div>
    <button class="btn-add" style="margin-top:16px" onclick="saveSetting('payment_gateway')">Save</button>`);
  if (pg.provider) $('pg-provider').value = pg.provider;
}

async function loadSmsSettings(panel) {
  const settings = await api('/super-admin/settings');
  const sms = settings.find((s) => s.setting_key === 'sms')?.value || {};
  panel.innerHTML = pageShell('SMS API', `
    <div class="form-grid">
      <div><label>Provider</label><select id="sms-provider"><option value="msg91">MSG91</option><option value="twilio">Twilio</option></select></div>
      <div><label>API Key</label><input id="sms-key" value="${sms.api_key || ''}"></div>
      <div><label>Sender ID</label><input id="sms-sender" value="${sms.sender_id || 'CREZY'}"></div>
      <div><label>OTP Template</label><input id="sms-tpl" value="${sms.template_otp || ''}"></div>
      <div><label><input type="checkbox" id="sms-enabled" ${sms.enabled ? 'checked' : ''}> Enabled</label></div>
    </div>
    <button class="btn-add" style="margin-top:16px" onclick="saveSetting('sms')">Save</button>`);
}

async function loadNotifSettings(panel) {
  const settings = await api('/super-admin/settings');
  const n = settings.find((s) => s.setting_key === 'notifications')?.value || {};
  panel.innerHTML = pageShell('Notifications', `
    <div class="form-grid">
      <div style="grid-column:1/-1"><label>FCM Server Key</label><input id="fcm-key" value="${n.fcm_server_key || ''}"></div>
      <div><label>Default Title</label><input id="fcm-title" value="${n.default_title || 'Crezycall'}"></div>
      <div><label><input type="checkbox" id="fcm-enabled" ${n.enabled ? 'checked' : ''}> Enabled</label></div>
    </div>
    <button class="btn-add" style="margin-top:16px" onclick="saveSetting('notifications')">Save</button>`);
}

async function loadRatesSettings(panel) {
  const settings = await api('/super-admin/settings');
  const p = settings.find((s) => s.setting_key === 'platform')?.value || {};
  panel.innerHTML = pageShell('Coin Plan / Rates', `
    <div class="form-grid">
      <div><label>Platform Fee %</label><input id="plat-fee" type="number" value="${p.platform_fee_percent || 10}"></div>
      <div><label>Min Withdrawal ₹</label><input id="plat-min-w" type="number" value="${p.min_withdrawal || 100}"></div>
      <div><label>Free Text Msgs</label><input id="plat-free-msg" type="number" value="${p.free_text_msgs || 10}"></div>
      <div><label>Text Msg ₹</label><input id="plat-text-cost" type="number" step="0.1" value="${p.text_msg_cost || 0.1}"></div>
      <div><label>Gift ₹</label><input id="plat-gift" type="number" value="${p.gift_cost || 1}"></div>
    </div>
    <button class="btn-add" style="margin-top:16px" onclick="savePlatformRates()">Save</button>`);
}

window.saveSetting = async function (key) {
  let value = {};
  if (key === 'payment_gateway') value = { provider: $('pg-provider').value, key_id: $('pg-key').value, key_secret: $('pg-secret').value, webhook_secret: $('pg-webhook').value, enabled: $('pg-enabled').checked };
  if (key === 'sms') value = { provider: $('sms-provider').value, api_key: $('sms-key').value, sender_id: $('sms-sender').value, template_otp: $('sms-tpl').value, enabled: $('sms-enabled').checked };
  if (key === 'notifications') value = { fcm_server_key: $('fcm-key').value, default_title: $('fcm-title').value, enabled: $('fcm-enabled').checked };
  await api(`/super-admin/settings/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) });
  alert('Saved!');
};

window.savePlatformRates = async function () {
  await api('/super-admin/settings/platform', {
    method: 'PATCH',
    body: JSON.stringify({
      value: {
        platform_fee_percent: parseFloat($('plat-fee').value),
        min_withdrawal: parseFloat($('plat-min-w').value),
        free_text_msgs: parseInt($('plat-free-msg').value, 10),
        text_msg_cost: parseFloat($('plat-text-cost').value),
        gift_cost: parseFloat($('plat-gift').value),
      },
    }),
  });
  alert('Rates saved!');
};

async function loadPlatformFeatures(panel) {
  const features = await api('/super-admin/platform-features');
  panel.innerHTML = pageShell('App Features', `
    <table class="admin-table"><thead><tr><th>Feature</th><th>User App</th><th>Host App</th></tr></thead><tbody>
    ${features.map((f) => `<tr><td>${f.label}</td>
      <td><input type="checkbox" id="pf-u-${f.feature_key}" ${f.user_enabled ? 'checked' : ''}></td>
      <td><input type="checkbox" id="pf-h-${f.feature_key}" ${f.host_enabled ? 'checked' : ''}></td></tr>`).join('')}
    </tbody></table>
    <button class="btn-add" style="margin-top:16px" onclick="savePlatformFeatures()">Save</button>`);
}

window.savePlatformFeatures = async function () {
  const features = await api('/super-admin/platform-features');
  await api('/super-admin/platform-features', {
    method: 'PATCH',
    body: JSON.stringify({
      features: features.map((f) => ({
        feature_key: f.feature_key,
        user_enabled: $(`pf-u-${f.feature_key}`).checked,
        host_enabled: $(`pf-h-${f.feature_key}`).checked,
      })),
    }),
  });
  alert('App features updated!');
};

async function loadManageAdmins(panel) {
  const admins = await api('/super-admin/admins');
  const permKeys = Object.keys(PERM_LABELS);
  panel.innerHTML = `
    <h1 class="page-heading">Manage Admins</h1>
    <div class="admin-panel-card"><div class="card-head">Create Employee Admin</div><div class="card-body">
      <div class="form-grid">
        <div><label>Name</label><input id="na-name"></div>
        <div><label>Email</label><input id="na-email" type="email"></div>
        <div><label>Password</label><input id="na-pass" type="password"></div>
      </div>
      <button class="btn-add" style="margin-top:14px" onclick="createEmployeeAdmin()">+ Create Admin</button>
      <p style="margin-top:12px;font-size:0.82rem;color:#64748b">Toggle permissions below — employee will only see checked menu items. Withdrawals, Payment, SMS, Notifications cannot be granted to employees.</p>
    </div></div>
    ${admins.filter((a) => a.role === 'admin').map((a) => {
      const p = typeof a.permissions === 'string' ? JSON.parse(a.permissions) : (a.permissions || {});
      return `<div class="admin-panel-card"><div class="card-head">${a.name} — ${a.email}</div><div class="card-body">
        <div class="perm-grid">${permKeys.map((k) => `<label><input type="checkbox" id="perm-${a.id}-${k}" ${p[k] ? 'checked' : ''}> ${PERM_LABELS[k]}</label>`).join('')}</div>
        <button class="btn-admin success" onclick="saveAdminPerms('${a.id}')">Save Permissions</button>
      </div></div>`;
    }).join('')}`;
}

window.createEmployeeAdmin = async () => {
  await api('/super-admin/admins', { method: 'POST', body: JSON.stringify({ name: $('na-name').value, email: $('na-email').value, password: $('na-pass').value }) });
  alert('Employee admin created');
  loadTab('manage-admins');
};

window.saveAdminPerms = async (id) => {
  const permissions = {};
  Object.keys(PERM_LABELS).forEach((k) => { permissions[k] = $(`perm-${id}-${k}`)?.checked || false; });
  await api(`/super-admin/admins/${id}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissions }) });
  alert('Permissions saved — employee will only see checked menus');
};

window.viewVerify = async (id) => {
  const v = await api(`/admin/agents/${id}/verification`);
  const scans = Array.isArray(v.face_scan_data) ? v.face_scan_data : [];
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `<div style="background:#16162a;border:1px solid #2d2d4a;border-radius:12px;padding:24px;max-width:600px;max-height:90vh;overflow:auto;color:#e2e8f0">
    <h3>${v.display_name}</h3><p style="color:#64748b">${v.phone} · ${v.email}</p>
    <img src="${v.verification_photo_url || v.photo_url}" style="max-width:200px;border-radius:8px;margin:12px 0">
    <div style="display:flex;flex-wrap:wrap;gap:8px">${scans.map((s) => `<div><small>${s.pose}</small><br><img src="${s.image}" width="100" style="border-radius:6px"></div>`).join('')}</div>
    <button class="btn-admin success" onclick="approveAgent('${id}');this.closest('div').parentElement.remove()">Approve</button>
    <button class="btn-admin outline" onclick="this.closest('div').parentElement.remove()">Close</button></div>`;
  document.body.appendChild(overlay);
};

window.approveAgent = async (id) => { await api(`/admin/agents/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved', audio_rate: $(`audio-${id}`)?.value || 5, video_rate: $(`video-${id}`)?.value || 20 }) }); alert('Approved'); loadTab('pending'); };
window.rejectAgent = async (id) => { await api(`/admin/agents/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }); loadTab('pending'); };
window.toggleHostOnline = async (id, on) => { await api(`/admin/agents/${id}`, { method: 'PATCH', body: JSON.stringify({ is_online: on, admin_forced_offline: !on }) }); loadTab('agents'); };
window.saveRates = async (id) => { await api(`/admin/agents/${id}`, { method: 'PATCH', body: JSON.stringify({ audio_rate: $(`audio-${id}`).value, video_rate: $(`video-${id}`).value }) }); alert('Saved'); };
window.blockUser = async (id, b) => { await api(`/admin/users/${id}/block`, { method: 'PATCH', body: JSON.stringify({ blocked: b }) }); loadTab('users'); };
window.closeAdminModal = closeAdminModal;

window.editHost = async (id) => {
  const h = await api(`/admin/agents/${id}`);
  let photoData = null;
  openAdminModal('Edit Host Profile', `
    <div class="admin-edit-photo-row">
      ${avatarImg(h.photo_url, 72)}
      <div>
        <label>Change photo</label>
        <input type="file" id="eh-photo" accept="image/*">
        <small style="color:#64748b">JPG/PNG — choose from gallery</small>
      </div>
    </div>
    <div class="form-grid" style="margin-top:14px">
      <div><label>Display Name</label><input id="eh-display" value="${(h.display_name || '').replace(/"/g, '&quot;')}"></div>
      <div><label>Account Name</label><input id="eh-name" value="${(h.name || '').replace(/"/g, '&quot;')}"></div>
      <div><label>Email</label><input value="${h.email || ''}" disabled style="opacity:0.6"></div>
      <div><label>Phone</label><input id="eh-phone" value="${h.phone || ''}"></div>
      <div><label>Age</label><input id="eh-age" type="number" min="18" max="99" value="${h.age || 22}"></div>
      <div><label>Audio ₹/min</label><input id="eh-audio" type="number" step="0.5" value="${h.audio_rate}"></div>
      <div><label>Video ₹/min</label><input id="eh-video" type="number" step="0.5" value="${h.video_rate}"></div>
      <div><label>Languages</label><input id="eh-lang" value="${(h.languages || 'Hindi, English').replace(/"/g, '&quot;')}"></div>
      <div style="grid-column:1/-1"><label>Bio</label><textarea id="eh-bio" rows="3">${h.bio || ''}</textarea></div>
      <div style="grid-column:1/-1"><label>Topics</label><input id="eh-topics" value="${(h.teaching_topics || '').replace(/"/g, '&quot;')}"></div>
    </div>`, async () => {
    try {
      await api(`/admin/agents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: $('eh-display').value,
          name: $('eh-name').value,
          phone: $('eh-phone').value,
          age: $('eh-age').value,
          audio_rate: $('eh-audio').value,
          video_rate: $('eh-video').value,
          languages: $('eh-lang').value,
          bio: $('eh-bio').value,
          teaching_topics: $('eh-topics').value,
          ...(photoData ? { photo_url: photoData } : {}),
        }),
      });
      toast('Host profile saved');
      closeAdminModal();
      loadTab(currentTab === 'pending' ? 'pending' : 'agents');
    } catch (e) {
      toast(e.message, true);
    }
  });
  bindPhotoPicker('eh-photo', null, (data) => {
    photoData = data;
    const preview = document.querySelector('#admin-edit-overlay .admin-avatar-thumb');
    if (preview) preview.src = data;
  });
};

window.editUser = async (id) => {
  const users = await api('/admin/users');
  const u = users.find((x) => x.id === id);
  if (!u) return toast('User not found', true);
  let photoData = null;
  const dob = u.date_of_birth ? String(u.date_of_birth).slice(0, 10) : '';
  openAdminModal('Edit User Profile', `
    <div class="admin-edit-photo-row">
      ${avatarImg(u.photo_url, 72)}
      <div>
        <label>Change photo</label>
        <input type="file" id="eu-photo" accept="image/*">
      </div>
    </div>
    <div class="form-grid" style="margin-top:14px">
      <div><label>Name</label><input id="eu-name" value="${(u.name || '').replace(/"/g, '&quot;')}"></div>
      <div><label>Phone</label><input id="eu-phone" value="${u.phone || ''}"></div>
      <div><label>Gender</label>
        <select id="eu-gender">
          <option value="">—</option>
          <option value="Female" ${u.gender === 'Female' ? 'selected' : ''}>Female</option>
          <option value="Male" ${u.gender === 'Male' ? 'selected' : ''}>Male</option>
          <option value="Other" ${u.gender === 'Other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
      <div><label>Date of Birth</label><input id="eu-dob" type="date" value="${dob}"></div>
      <div><label>Wallet (₹)</label><input id="eu-wallet" type="number" step="1" value="${u.wallet_balance}"></div>
      <div><label>Email</label><input value="${u.email}" disabled style="opacity:0.6"></div>
    </div>`, async () => {
    try {
      await api(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: $('eu-name').value,
          phone: $('eu-phone').value,
          gender: $('eu-gender').value || null,
          date_of_birth: $('eu-dob').value || null,
          wallet_balance: $('eu-wallet').value,
          ...(photoData ? { photo_url: photoData } : {}),
        }),
      });
      toast('User profile saved');
      closeAdminModal();
      loadTab('users');
    } catch (e) {
      toast(e.message, true);
    }
  });
  const preview = document.querySelector('#admin-edit-overlay .admin-avatar-thumb');
  bindPhotoPicker('eu-photo', null, (data) => { photoData = data; if (preview) preview.src = data; });
};

window.updateWithdrawal = async (id, s) => { await api(`/admin/withdrawals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) }); loadTab('withdrawals'); };

function showMain() {
  $('auth-view').classList.add('hidden');
  $('main-view').classList.remove('hidden');
  const u = getUser();
  $('admin-avatar').textContent = (u?.name || 'A')[0].toUpperCase();
  buildNav();
}

const u = getUser();
if (getToken() && u && (u.role === 'admin' || u.role === 'super_admin')) {
  myRole = u.role;
  try { myPerms = JSON.parse(localStorage.getItem('permissions') || '{}'); } catch { myPerms = {}; }
  showMain();
} else if (getToken()) localStorage.clear();

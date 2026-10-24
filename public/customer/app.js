let socket;
let currentCallId;
let currentCallType = 'audio';
let currentRate = 0;
let callEngine = null;
let callTimerInterval = null;
let totalChargedThisCall = 0;
let selectedRecharge = 100;

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

let listTab = 'all';
let filterSearch = '';
let filterLang = '';
let selectedTalktimeOffer = null;
let currentHostDetail = null;
let followedHostIds = [];
let newAgentIds = [];
let randomFilterActive = false;
let blockTargetAgentId = null;
let blockedProfileAgentId = null;
let blockedListCache = [];
let hostDetailReturn = 'discover';
const RANDOM_MATCH_RATE = 30;
const RANDOM_RATE_TOLERANCE = 12;
const MIN_CALL_BALANCE = 30;
let talkNowAgentId = null;

function openBottomSheet(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeBottomSheet(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function bindBottomSheets() {
  document.querySelectorAll('.fc-bs-backdrop[data-close]').forEach((bd) => {
    bd.addEventListener('click', () => closeBottomSheet(bd.dataset.close));
  });
}

function renderPopupRechargeCards(offers, selectedId) {
  return offers
    .map(
      (o, i) => `
    <button type="button" class="fc-rc-popup" data-offer="${o.id}">
      ${o.best || i < 3 ? '<span class="best-tag">Best</span>' : ''}
      <div class="get">Get <span class="coin-gold">🪙</span> ${o.credit.toFixed(1)}</div>
      <div class="pay">Pay Rs ${o.pay.toFixed(1)}</div>
    </button>`
    )
    .join('');
}

function renderTalktimeRechargeCards(offers, selectedId) {
  return offers
    .map(
      (o, i) => `
    <button type="button" class="fc-rc-light ${o.id === selectedId ? 'selected' : ''}" data-offer="${o.id}">
      ${o.best || i < 3 ? '<span class="best-tag">Best</span>' : ''}
      <div class="get">Get <span class="coin-gold">🪙</span> ${o.credit.toFixed(1)}</div>
      <div class="pay">Pay Rs ${o.pay.toFixed(1)}</div>
    </button>`
    )
    .join('');
}

async function purchaseOffer(offerId, onDone) {
  const data = await api('/customer/recharge', {
    method: 'POST',
    body: JSON.stringify({ offer_id: offerId }),
  });
  updateWallet(data.balance);
  toast(data.message || 'Recharged!');
  if (onDone) onDone(data);
}

function navigateScreen(name) {
  closeBottomSheet('talk-now-modal');
  closeBottomSheet('deposit-modal');
  document.querySelectorAll('.fc-screen').forEach((s) => s.classList.remove('active'));
  $(`screen-${name}`)?.classList.add('active');

  const tabScreens = ['discover', 'chats', 'profile'];
  const subScreens = ['host-detail', 'talktime'];
  const app = $('main-view');
  app?.classList.toggle('is-tab-view', tabScreens.includes(name));
  app?.classList.toggle('is-discover', name === 'discover');
  app?.classList.toggle('is-subpage', subScreens.includes(name));
  document.body.classList.toggle('fc-no-scroll', subScreens.includes(name));

  const navMap = { discover: 'discover', chats: 'chats', profile: 'profile', talktime: 'profile' };
  document.querySelectorAll('.fc-nav-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.nav === (navMap[name] || ''));
  });
  document.querySelector('.fc-bottom-nav')?.classList.toggle('hidden', subScreens.includes(name));
  const fab = $('btn-random-match');
  if (fab) fab.classList.toggle('hidden', name !== 'discover');
  if (name === 'chats') loadChats();
  if (name === 'profile') loadProfileScreen();
  if (name === 'talktime') loadTalktimeScreen();
}

function bindBottomNav() {
  document.querySelectorAll('.fc-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.nav === 'discover') navigateScreen('discover');
      else navigateScreen(btn.dataset.nav);
    });
  });
}

function bindListTabs() {
  document.querySelectorAll('.fc-topbar-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.fc-topbar-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      listTab = tab.dataset.list || 'all';
      randomFilterActive = false;
      $('random-filter-banner')?.classList.add('hidden');
      renderAgentList();
    });
  });
}

function bindFilterModal() {
  $('btn-open-filter')?.addEventListener('click', () => $('filter-modal')?.classList.remove('hidden'));
  $('filter-close')?.addEventListener('click', () => $('filter-modal')?.classList.add('hidden'));
  $('filter-dismiss')?.addEventListener('click', () => $('filter-modal')?.classList.add('hidden'));
  $('filter-apply')?.addEventListener('click', async () => {
    filterSearch = ($('filter-search')?.value || '').trim().toLowerCase();
    const sortBtn = document.querySelector('#filter-sort .fc-pill.active');
    priceSort = sortBtn?.dataset.sort || 'default';
    const langBtn = document.querySelector('#filter-lang .fc-pill.active');
    filterLang = langBtn?.dataset.lang || '';
    $('filter-modal')?.classList.add('hidden');
    try {
      await loadAgents();
    } catch (e) {
      toast(e.message, true);
      renderAgentList();
    }
  });
  document.querySelectorAll('#filter-sort .fc-pill').forEach((p) => {
    p.addEventListener('click', () => {
      document.querySelectorAll('#filter-sort .fc-pill').forEach((x) => x.classList.remove('active'));
      p.classList.add('active');
    });
  });
  document.querySelectorAll('#filter-lang .fc-pill').forEach((p) => {
    p.addEventListener('click', () => {
      document.querySelectorAll('#filter-lang .fc-pill').forEach((x) => x.classList.remove('active'));
      p.classList.add('active');
    });
  });
  $('talktime-back')?.addEventListener('click', () => navigateScreen('profile'));
  $('host-detail-back')?.addEventListener('click', () => {
    $('host-detail-footer')?.classList.add('hidden');
    $('screen-host-detail')?.classList.remove('conversation-only');
    navigateScreen(hostDetailReturn);
  });
  document.querySelectorAll('[data-go="talktime"]').forEach((el) => {
    el.addEventListener('click', () => navigateScreen('talktime'));
  });
  $('btn-statement')?.addEventListener('click', async () => {
    await loadStatement();
    navigateScreen('talktime');
  });
  bindProfileModals();
  document.querySelectorAll('.fc-chats-tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.fc-chats-tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      loadChats(t.dataset.chats);
    });
  });
}

function bindAuth() {
  let regPhotoDataUrl = null;

  $('reg-photo')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      regPhotoDataUrl = await cropPortraitForProfile(file);
      if ($('reg-photo-preview')) $('reg-photo-preview').src = regPhotoDataUrl;
    } catch (err) {
      toast(err.message, true);
      e.target.value = '';
    }
  });

  $('show-register')?.addEventListener('click', (e) => {
    e.preventDefault();
    $('login-form')?.classList.add('hidden');
    $('register-form')?.classList.remove('hidden');
  });
  $('show-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    $('register-form')?.classList.add('hidden');
    $('login-form')?.classList.remove('hidden');
  });

  $('btn-register')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const name = $('reg-name')?.value?.trim();
    const email = ($('reg-email')?.value || '').trim().toLowerCase();
    const password = $('reg-password')?.value || '';
    const phone = $('reg-phone')?.value?.trim();
    const gender = $('reg-gender')?.value;
    const date_of_birth = $('reg-dob')?.value;
    if (!name || !email || !password || !phone || !gender || !date_of_birth) {
      return toast('Fill all fields — name, email, password, phone, gender, date of birth', true);
    }
    if (!regPhotoDataUrl) return toast('Upload a profile photo with your face clearly visible', true);
    try {
      const data = await api('/auth/register/customer', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          phone,
          gender,
          date_of_birth,
          photo_url: regPhotoDataUrl,
        }),
        skipAuth: true,
      });
      setAuth(data.token, data.user);
      showMain();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

function customerLogout() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (typeof clearPortalAuth === 'function') clearPortalAuth();
  localStorage.removeItem('customer_token');
  localStorage.removeItem('customer_user');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  $('main-view')?.classList.add('hidden');
  $('auth-view')?.classList.remove('hidden');
  document.body.classList.remove('fc-customer');
  $('register-form')?.classList.add('hidden');
  $('login-form')?.classList.remove('hidden');
}

$('btn-logout')?.addEventListener('click', customerLogout);

function updateWallet(balance) {
  const amt = (balance ?? 0).toFixed(2);
  if ($('wallet-amount')) $('wallet-amount').textContent = amt;
  if ($('wallet-big')) $('wallet-big').textContent = amt;
  if ($('profile-wallet')) $('profile-wallet').textContent = parseFloat(amt).toFixed(1);
  const u = getUser();
  if (u && getToken()) {
    u.wallet_balance = balance;
    setAuth(getToken(), u);
  }
}

$('btn-gmail')?.addEventListener('click', () => toast('Gmail login — connect OAuth in production'));

let selectedAgentId = null;
let agentsCache = [];
let recentIds = [];
let priceSort = 'default';
let selectedDepositOffer = null;

function hostStatusPill(a) {
  if (a.is_busy) return '<span class="fc-status-pill busy">● Busy</span>';
  if (a.is_online) return '<span class="fc-status-pill online">● Online</span>';
  return '<span class="fc-status-pill offline">● Offline</span>';
}

function renderFlirtzyCard(a) {
  const topics = (a.teaching_topics || 'Chat, Fun').split(',').slice(0, 3).join(', ').trim();
  const langs = a.languages || 'Hindi, English';
  return `
    <article class="fc-host-card" onclick="openAgentDetail('${a.id}')" style="cursor:pointer">
      ${hostStatusPill(a)}
      <div class="fc-host-main">
        <img class="fc-host-avatar" src="${a.photo_url}" alt="">
        <div class="fc-host-info">
          <div class="fc-host-name-row">
            <span class="fc-host-name">${escapeHtml(a.display_name)}</span>
            <span class="fc-verified" title="Verified">✓</span>
          </div>
          <div class="fc-host-flag">🇮🇳</div>
          <p class="fc-host-talks"><strong>Talks about:</strong> ${escapeHtml(topics)}</p>
          <p class="fc-host-lang"><span>🌐</span><span>${escapeHtml(langs)}</span></p>
        </div>
      </div>
      <button type="button" class="fc-talk-now" onclick="event.stopPropagation();openTalkNowPopup('${a.id}')">TALK NOW</button>
    </article>`;
}

window.openTalkNowPopup = function (agentId) {
  const a = agentsCache.find((x) => x.id === agentId);
  if (!a) return;
  talkNowAgentId = agentId;
  const balance = parseFloat(getUser()?.wallet_balance ?? 0);
  const needForVideo = Math.max(parseFloat(a.video_rate) || 0, MIN_CALL_BALANCE);

  if (balance < needForVideo) {
    openDepositModal(true);
    return;
  }

  $('talk-rate-audio').textContent = parseFloat(a.audio_rate).toFixed(1);
  $('talk-rate-video').textContent = parseFloat(a.video_rate).toFixed(1);
  openBottomSheet('talk-now-modal');
};

function bindTalkNowModal() {
  $('talk-now-close')?.addEventListener('click', () => {
    closeBottomSheet('talk-now-modal');
    talkNowAgentId = null;
  });
  $('talk-opt-audio')?.addEventListener('click', async () => {
    const a = agentsCache.find((x) => x.id === talkNowAgentId);
    closeBottomSheet('talk-now-modal');
    if (!a) return;
    if (!a.is_online || a.is_busy) return toast('Host is not available right now', true);
    const bal = parseFloat(getUser()?.wallet_balance ?? 0);
    if (bal < parseFloat(a.audio_rate)) {
      openDepositModal(true);
      return;
    }
    startCall(a.id, 'audio', a.audio_rate);
    talkNowAgentId = null;
  });
  $('talk-opt-video')?.addEventListener('click', async () => {
    const a = agentsCache.find((x) => x.id === talkNowAgentId);
    closeBottomSheet('talk-now-modal');
    if (!a) return;
    if (!a.is_online || a.is_busy) return toast('Host is not available right now', true);
    const bal = parseFloat(getUser()?.wallet_balance ?? 0);
    if (bal < parseFloat(a.video_rate)) {
      openDepositModal(true);
      return;
    }
    startCall(a.id, 'video', a.video_rate);
    talkNowAgentId = null;
  });
}

function getFilteredAgents() {
  let list = [...agentsCache];
  if (listTab === 'new') {
    list = list.filter((a) => newAgentIds.includes(a.id) || a.is_new);
    if (!list.length) {
      list = [...agentsCache]
        .sort((a, b) => new Date(b.joined_at || 0) - new Date(a.joined_at || 0))
        .slice(0, 3);
    }
  }
  if (listTab === 'follow') {
    list = list.filter((a) => followedHostIds.includes(a.id) || a.is_followed);
  }
  if (randomFilterActive) {
    list = list.filter((a) => {
      const rate = a.min_rate ?? Math.min(parseFloat(a.audio_rate), parseFloat(a.video_rate));
      return Math.abs(rate - RANDOM_MATCH_RATE) <= RANDOM_RATE_TOLERANCE;
    });
  }
  return list;
}

function renderAgentList() {
  const list = getFilteredAgents();
  $('agents-list').innerHTML = list.length
    ? list.map(renderFlirtzyCard).join('')
    : `<p style="text-align:center;color:var(--muted);padding:24px">${
        randomFilterActive ? 'No hosts in this range — clear filter' : 'No hosts found'
      }</p>`;
}

async function loadAgents() {
  const params = new URLSearchParams({ sort: priceSort });
  if (filterSearch) params.set('search', filterSearch);
  if (filterLang) params.set('lang', filterLang);
  const data = await api(`/customer/agents?${params}`);
  agentsCache = data.agents || data;
  recentIds = data.recent_ids || [];
  followedHostIds = data.follow_ids || followedHostIds;
  newAgentIds = data.new_agent_ids || [];
  renderAgentList();
}

async function openDepositModal(fromLowBalance = false) {
  CallAlerts?.unlock();
  if ($('min-call-coins')) $('min-call-coins').textContent = String(MIN_CALL_BALANCE);
  const offers = await api('/customer/deposit-offers');
  const gridOffers = offers.filter((o) => o.pay <= 800).slice(0, 6);
  selectedDepositOffer = gridOffers[0]?.id || offers[0]?.id || null;
  $('deposit-offers-list').innerHTML = renderPopupRechargeCards(gridOffers, selectedDepositOffer);
  document.querySelectorAll('#deposit-offers-list .fc-rc-popup').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await purchaseOffer(btn.dataset.offer, () => {
          closeBottomSheet('deposit-modal');
          if (fromLowBalance && talkNowAgentId) {
            setTimeout(() => openTalkNowPopup(talkNowAgentId), 400);
          }
        });
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
  openBottomSheet('deposit-modal');
}

async function loadTalktimeScreen() {
  const data = await api('/customer/wallet').catch(() => ({ balance: getUser()?.wallet_balance || 0, transactions: [] }));
  updateWallet(data.balance);
  try {
    await loadStatement();
  } catch {
    /* statement optional on talktime open */
  }
  const offers = await api('/customer/deposit-offers').catch(() => []);
  const gridOffers = offers.filter((o) => o.pay <= 800).slice(0, 9);
  selectedTalktimeOffer = gridOffers[0]?.id || null;
  $('talktime-grid').innerHTML = renderTalktimeRechargeCards(gridOffers, selectedTalktimeOffer);
  document.querySelectorAll('#talktime-grid .fc-rc-light').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTalktimeOffer = btn.dataset.offer;
      document.querySelectorAll('#talktime-grid .fc-rc-light').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  if (!$('tx-list')?.innerHTML?.includes('Statement')) {
    $('tx-list').innerHTML =
      data.transactions?.length > 0
        ? '<h4 style="margin:12px 0 8px;font-weight:600">Recent recharge</h4>' +
          data.transactions
            .slice(0, 5)
            .map(
              (t) => `<div style="padding:10px 0;border-bottom:1px solid #eee">
            <span style="color:${parseFloat(t.amount) > 0 ? '#2e7d32' : '#c62828'}">${parseFloat(t.amount) > 0 ? '+' : ''}₹${t.amount}</span>
            — ${escapeHtml(t.description || t.type)}
          </div>`
            )
            .join('')
        : '';
  }
}

$('btn-talktime-continue')?.addEventListener('click', async () => {
  if (!selectedTalktimeOffer) return toast('Select a pack', true);
  try {
    await purchaseOffer(selectedTalktimeOffer, () => loadTalktimeScreen());
  } catch (e) {
    toast(e.message, true);
  }
});

async function loadProfileScreen() {
  const u = getUser();
  if (!u) return;
  try {
    const p = await api('/customer/profile');
    setAuth(getToken(), { ...u, ...p, role: 'customer' });
    if ($('profile-avatar')) $('profile-avatar').src = p.photo_url || 'https://i.pravatar.cc/150?img=5';
    if ($('profile-name')) $('profile-name').textContent = p.name || 'User';
    const meta = [p.gender, p.age != null ? `${p.age} yrs` : null].filter(Boolean).join(' · ');
    if ($('profile-gender-age')) $('profile-gender-age').textContent = meta || 'Member';
  } catch {
    if ($('profile-name')) $('profile-name').textContent = u.name || 'User';
  }
  const shortId = String(u.id || '').replace(/-/g, '').slice(0, 5).toUpperCase() || '00000';
  if ($('profile-gender-age')) $('profile-gender-age').textContent = 'Member';
  if ($('profile-id')) $('profile-id').textContent = `ID:${shortId}`;
  if ($('profile-wallet')) $('profile-wallet').textContent = (u.wallet_balance ?? 0).toFixed(1);
  updateWallet(u.wallet_balance || 0);
}

async function loadChats(mode = 'my') {
  const box = $('chats-list');
  if (!box) return;
  if (mode === 'system') {
    box.innerHTML = '<p style="padding:24px;text-align:center;color:#6b7280">No system messages</p>';
    return;
  }
  try {
    const chats = await api('/customer/chats');
    box.innerHTML = chats.length
      ? chats
          .map((c) => {
            const d = new Date(c.last_at);
            const time = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const preview = c.last_message?.substring(0, 50) || 'Tap to chat';
            const tick = c.sender_role === 'customer' && c.last_type !== 'call' ? '✓✓ ' : '';
            return `<button type="button" class="fc-chat-row" data-open-chat="${c.agent_id}">
              <img src="${c.photo_url}" alt="">
              <div class="meta">
                <div class="name">${escapeHtml(c.display_name)}</div>
                <div class="preview">${tick}${escapeHtml(preview)}</div>
              </div>
              <span class="time">${time}</span>
            </button>`;
          })
          .join('')
      : '<p style="padding:24px;text-align:center;color:#6b7280">No chats yet — talk to a host!</p>';
    box.querySelectorAll('[data-open-chat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        hostDetailReturn = 'chats';
        openAgentDetail(btn.dataset.openChat, 'conversation');
      });
    });
  } catch {
    box.innerHTML = '<p style="padding:24px;text-align:center;color:#6b7280">No chats yet</p>';
  }
}

$('wallet-display')?.addEventListener('click', () => navigateScreen('talktime'));
$('deposit-close')?.addEventListener('click', () => closeBottomSheet('deposit-modal'));
$('btn-logout-profile')?.addEventListener('click', customerLogout);
$('btn-tx-history')?.addEventListener('click', async () => {
  await loadStatement();
  navigateScreen('talktime');
});
let editPhotoDataUrl = null;

$('btn-profile-edit')?.addEventListener('click', async () => {
  try {
    const p = await api('/customer/profile');
    editPhotoDataUrl = null;
    $('edit-name').value = p.name || '';
    $('edit-phone').value = p.phone || '';
    if ($('edit-photo-preview')) $('edit-photo-preview').src = p.photo_url || 'https://i.pravatar.cc/150?img=5';
    if ($('edit-photo')) $('edit-photo').value = '';
    $('edit-profile-modal')?.classList.remove('hidden');
  } catch (e) {
    toast(e.message, true);
  }
});
$('edit-photo')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Please choose a photo file', true);
  try {
    editPhotoDataUrl = await cropPortraitForProfile(file);
    if ($('edit-photo-preview')) $('edit-photo-preview').src = editPhotoDataUrl;
  } catch (err) {
    toast(err.message, true);
    e.target.value = '';
  }
});
$('edit-profile-close')?.addEventListener('click', () => {
  editPhotoDataUrl = null;
  $('edit-profile-modal')?.classList.add('hidden');
});
$('edit-profile-save')?.addEventListener('click', async () => {
  try {
    const payload = {
      name: $('edit-name').value,
      phone: $('edit-phone').value,
    };
    if (editPhotoDataUrl) payload.photo_url = editPhotoDataUrl;
    const data = await api('/customer/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setAuth(getToken(), data.user);
    editPhotoDataUrl = null;
    $('edit-profile-modal')?.classList.add('hidden');
    loadProfileScreen();
    toast('Profile updated');
  } catch (e) {
    toast(e.message, true);
  }
});
$('btn-blocked-list')?.addEventListener('click', () => {
  loadBlockedList();
  $('blocked-modal')?.classList.remove('hidden');
});
$('blocked-modal-close')?.addEventListener('click', () => $('blocked-modal')?.classList.add('hidden'));
$('blocked-profile-close')?.addEventListener('click', () => $('blocked-profile-modal')?.classList.add('hidden'));
$('btn-unblock-host')?.addEventListener('click', async () => {
  if (!blockedProfileAgentId) return;
  try {
    await unblockHost(blockedProfileAgentId);
  } catch (e) {
    toast(e.message, true);
  }
});
$('btn-settings')?.addEventListener('click', () => $('settings-modal')?.classList.remove('hidden'));
$('settings-modal-close')?.addEventListener('click', () => $('settings-modal')?.classList.add('hidden'));

function showHostChatTab(agentId) {
  document.querySelectorAll('.fc-host-tab').forEach((t) => t.classList.remove('active'));
  document.querySelector('.fc-host-tab[data-dtab="chat"]')?.classList.add('active');
  $('detail-tab-about')?.classList.add('hidden');
  $('detail-tab-chat')?.classList.remove('hidden');
  $('host-detail-footer')?.classList.add('hidden');
  loadChatMessages(agentId);
}

function chatPanelHtml() {
  return `
      <div id="detail-tab-chat" class="fc-host-panel fc-host-chat-panel fc-conversation-panel">
        <div class="fc-host-chat-msgs" id="chat-messages">Loading...</div>
        <div class="fc-host-gifts" id="gift-picker"></div>
        <div class="fc-host-chat-compose">
          <button type="button" class="fc-host-call-inline" id="btn-chat-call" aria-label="Call">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.01l-2.2 2.22z"/></svg>
          </button>
          <input type="text" id="msg-input" placeholder="Type message..." autocomplete="off">
          <button type="button" class="fc-host-send" id="btn-send-msg">Send</button>
        </div>
      </div>`;
}

function bindChatPanel(agentId, gifts) {
  $('gift-picker').innerHTML = (gifts || ['❤️', '💕', '😍'])
    .map((g) => `<button type="button" class="fc-host-gift-btn" data-gift="${g}">${g}</button>`)
    .join('');
  document.querySelectorAll('[data-gift]').forEach((btn) => {
    btn.onclick = () => sendGift(agentId, btn.dataset.gift);
  });
  $('btn-chat-call')?.addEventListener('click', () => openTalkNowPopup(agentId));
  $('btn-send-msg').onclick = () => sendMessage(agentId, 'text');
  $('msg-input').onkeydown = (e) => {
    if (e.key === 'Enter') sendMessage(agentId, 'text');
  };
  loadChatMessages(agentId);
}

window.openAgentDetail = async function (agentId, startTab) {
  const conversationOnly = startTab === 'conversation';
  if (!startTab || startTab === 'about') hostDetailReturn = 'discover';
  selectedAgentId = agentId;
  try {
    const a = await api(`/customer/agents/${agentId}`);
    currentHostDetail = a;
    $('host-detail-title').textContent = a.display_name;
    $('screen-host-detail')?.classList.toggle('conversation-only', conversationOnly);
    $('host-detail-footer')?.classList.add('hidden');

    if (conversationOnly) {
      $('host-detail-content').innerHTML = chatPanelHtml();
      bindChatPanel(agentId, a.gifts);
      navigateScreen('host-detail');
      return;
    }

    $('screen-host-detail')?.classList.remove('conversation-only');
    const topics = (a.teaching_topics || 'Chat').split(',').map((t) => t.trim());
    const topicGroups = [
      { title: 'Sports', items: topics.slice(0, 1) },
      { title: 'Topics', items: topics.slice(1, 4) },
      { title: 'Languages', items: (a.languages || 'Hindi, English').split(',').map((l) => l.trim()) },
    ];
    const isFollowing = followedHostIds.includes(agentId);
    const langLine = (a.languages || 'Hindi, English').trim();
    const statusClass = a.is_busy ? 'busy' : a.is_online ? 'online' : 'offline';
    $('host-detail-content').innerHTML = `
      <section class="fc-host-hero">
        <div class="fc-host-photo-wrap">
          <img class="fc-host-photo" src="${a.photo_url}" alt="${escapeHtml(a.display_name)}">
          <span class="fc-host-photo-dot ${statusClass}"></span>
        </div>
        <div class="fc-host-hero-info">
          <h2 class="fc-host-hero-name">${escapeHtml(a.display_name)}</h2>
          <p class="fc-host-hero-lang">${escapeHtml(langLine)}</p>
          <p class="fc-host-hero-country">Country: Ind 🇮🇳</p>
          <button type="button" class="fc-host-follow-btn ${isFollowing ? 'is-following' : ''}" id="btn-follow">
            ${isFollowing ? '✓ Following' : '<span class="plus">+</span> Follow'}
          </button>
          <button type="button" class="fc-host-call-icon-btn" id="btn-hero-call" aria-label="Call host">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.01l-2.2 2.22z"/></svg>
            <span>Call</span>
          </button>
          <p class="fc-host-follow-hint">Follow to get notified when they come online</p>
        </div>
      </section>
      <nav class="fc-host-tabs" aria-label="Profile sections">
        <button type="button" class="fc-host-tab ${startTab === 'chat' ? '' : 'active'}" data-dtab="about" aria-label="About">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
        </button>
        <button type="button" class="fc-host-tab ${startTab === 'chat' ? 'active' : ''}" data-dtab="chat" aria-label="Chat">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>
        </button>
      </nav>
      <div id="detail-tab-about" class="fc-host-panel ${startTab === 'chat' ? 'hidden' : ''}">
        <button type="button" class="fc-host-call-me" id="detail-call-me">Call me</button>
        <h3 class="fc-host-about-title">About me:</h3>
        ${topicGroups
          .map(
            (g) => `<div class="fc-host-tag-group">
          <h4>${g.title}</h4>
          <div class="fc-host-tags">${g.items.filter(Boolean).map((i) => `<span class="fc-host-tag">${escapeHtml(i)}</span>`).join('')}</div>
        </div>`
          )
          .join('')}
        ${a.bio ? `<p class="fc-host-bio">${escapeHtml(a.bio)}</p>` : ''}
        <p class="fc-host-rates">Audio 🪙${parseFloat(a.audio_rate).toFixed(1)}/min · Video 🪙${parseFloat(a.video_rate).toFixed(1)}/min</p>
      </div>
      <div id="detail-tab-chat" class="fc-host-panel fc-host-chat-panel ${startTab === 'chat' ? '' : 'hidden'}">
        <div class="fc-host-chat-msgs" id="chat-messages">Loading...</div>
        <div class="fc-host-gifts" id="gift-picker"></div>
        <div class="fc-host-chat-compose">
          <button type="button" class="fc-host-call-inline" id="btn-chat-call" aria-label="Call">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.01l-2.2 2.22z"/></svg>
          </button>
          <input type="text" id="msg-input" placeholder="Type message..." autocomplete="off">
          <button type="button" class="fc-host-send" id="btn-send-msg">Send</button>
        </div>
      </div>`;
    bindChatPanel(agentId, a.gifts);
    document.querySelectorAll('.fc-host-tab').forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll('.fc-host-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const about = $('detail-tab-about');
        const chat = $('detail-tab-chat');
        if (tab.dataset.dtab === 'chat') {
          about?.classList.add('hidden');
          chat?.classList.remove('hidden');
          $('host-detail-footer')?.classList.add('hidden');
          loadChatMessages(agentId);
        } else {
          chat?.classList.add('hidden');
          about?.classList.remove('hidden');
          $('host-detail-footer')?.classList.remove('hidden');
        }
      };
    });
    $('btn-follow').onclick = async () => {
      const btn = $('btn-follow');
      try {
        if (followedHostIds.includes(agentId)) {
          await api(`/customer/follows/${agentId}`, { method: 'DELETE' });
          followedHostIds = followedHostIds.filter((id) => id !== agentId);
          btn.classList.remove('is-following');
          btn.innerHTML = '<span class="plus">+</span> Follow';
          toast('Unfollowed');
        } else {
          await api(`/customer/follows/${agentId}`, { method: 'POST' });
          followedHostIds.push(agentId);
          btn.classList.add('is-following');
          btn.textContent = '✓ Following';
          toast('Following');
        }
      } catch (e) {
        toast(e.message, true);
      }
    };
    $('host-detail-menu').onclick = () => {
      blockTargetAgentId = agentId;
      $('host-menu-sheet')?.classList.remove('hidden');
    };
    if (startTab === 'chat') {
      $('host-detail-footer')?.classList.add('hidden');
    } else {
      $('host-detail-footer')?.classList.remove('hidden');
    }
    $('detail-say-hi').onclick = () => showHostChatTab(agentId);
    $('detail-call').onclick = () => openTalkNowPopup(agentId);
    $('detail-call-me').onclick = () => openTalkNowPopup(agentId);
    $('btn-hero-call')?.addEventListener('click', () => openTalkNowPopup(agentId));
    if (startTab !== 'chat') {
      $('host-detail-footer')?.classList.remove('hidden');
    }
    navigateScreen('host-detail');
  } catch (e) {
    toast(e.message, true);
  }
};

async function loadChatMessages(agentId) {
  try {
    const items = await api(`/customer/agents/${agentId}/timeline`);
    const box = $('chat-messages');
    if (!box) return;
    box.innerHTML = items.length
      ? items
          .map((m) => {
            const t = new Date(m.created_at).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });
            if (m.item_type === 'call') {
              return `<div class="fc-timeline-call">${escapeHtml(m.body)}<br><small>${t}</small></div>`;
            }
            return `
        <div class="chat-msg ${m.sender_role === 'customer' ? 'mine' : ''} ${m.msg_type === 'gift' ? 'gift' : ''}">
          <div class="bubble">${m.msg_type === 'gift' ? '🎁 ' : ''}${escapeHtml(m.body)}${parseFloat(m.gist_charge) > 0 ? ` <small>(₹${m.gist_charge})</small>` : ''}</div>
          <div style="font-size:0.7rem;color:var(--muted);margin-top:2px">${t}</div>
        </div>`;
          })
          .join('')
      : '<p style="color:var(--muted)">No messages yet. Say hi!</p>';
    box.scrollTop = box.scrollHeight;
  } catch {
    $('chat-messages').innerHTML = '<p style="color:var(--muted)">Chat unavailable</p>';
  }
}

async function sendMessage(agentId, msgType) {
  const body = $('msg-input')?.value?.trim();
  if (!body) return;
  try {
    const res = await api(`/customer/agents/${agentId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, msg_type: msgType || 'text' }),
    });
    if (res.balance != null) updateWallet(res.balance);
    if (res.charge > 0) toast(`Sent · ₹${res.charge} charged`);
    else toast(`Sent · Free (${res.freeLeft ?? 0} free left)`);
    $('msg-input').value = '';
    loadChatMessages(agentId);
  } catch (e) {
    toast(e.message, true);
  }
}

async function sendGift(agentId, emoji) {
  try {
    const res = await api(`/customer/agents/${agentId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ msg_type: 'gift', gift_emoji: emoji, body: emoji }),
    });
    if (res.balance != null) updateWallet(res.balance);
    toast(`Gift ${emoji} sent · ₹1`);
    loadChatMessages(agentId);
  } catch (e) {
    toast(e.message, true);
  }
}

async function loadStatement() {
  const s = await api('/customer/statement');
  updateWallet(s.balance);
  const tx = $('tx-list');
  if (!tx) return s;
  const stmtCalls =
    s.calls
      ?.map(
        (c) => `
      <div class="fc-stmt-line">
        <strong>Call</strong><br>
        ${escapeHtml(c.statement_line || `${c.agent_name} — ${c.call_type}`)}
        <div style="color:var(--muted);font-size:0.75rem;margin-top:4px">${new Date(c.created_at).toLocaleString()}</div>
      </div>`
      )
      .join('') || '<p style="color:var(--muted)">No calls yet</p>';
  tx.innerHTML = `
    <h4 style="margin:16px 0 8px;font-weight:600">Statement — calls</h4>
    ${stmtCalls}
    <h4 style="margin:16px 0 8px;font-weight:600">Recharge & wallet</h4>
    ${
      s.transactions
        ?.map(
          (t) => `
      <div class="fc-stmt-line">
        <span style="color:${parseFloat(t.amount) > 0 ? '#2e7d32' : '#c62828'}">${parseFloat(t.amount) > 0 ? '+' : ''}₹${t.amount}</span>
        — ${escapeHtml(t.description || t.type)}
        <div style="color:var(--muted);font-size:0.75rem">${new Date(t.created_at).toLocaleString()}</div>
      </div>`
        )
        .join('') || '<p style="color:var(--muted)">No transactions</p>'
    }
    <h4 style="margin:16px 0 8px;font-weight:600">Messages</h4>
    ${
      s.messages
        ?.map(
          (m) => `
      <div class="fc-stmt-line">
        To ${escapeHtml(m.display_name)}: ${escapeHtml(m.msg_type === 'gift' ? m.body : (m.body || '').substring(0, 40))}
        ${parseFloat(m.gist_charge) > 0 ? ` · ₹${m.gist_charge}` : ' · free'}
      </div>`
        )
        .join('') || ''
    }`;
  return s;
}

async function loadBlockedList() {
  const box = $('blocked-list');
  if (!box) return;
  try {
    const list = await api('/customer/blocks');
    blockedListCache = list;
    box.innerHTML = list.length
      ? list
          .map(
            (b) => `
        <button type="button" class="fc-chat-row fc-blocked-row" data-blocked-id="${b.agent_id}">
          <img src="${b.photo_url}" alt="">
          <div class="meta">
            <div class="name">${escapeHtml(b.display_name)}</div>
            <div class="preview">${b.reason ? escapeHtml(b.reason) : 'Blocked — tap to view'}</div>
          </div>
          <span class="time">›</span>
        </button>`
          )
          .join('')
      : '<p style="padding:24px;text-align:center;color:#6b7280">No blocked hosts</p>';
    box.querySelectorAll('[data-blocked-id]').forEach((row) => {
      row.addEventListener('click', () => {
        const b = blockedListCache.find((x) => x.agent_id === row.dataset.blockedId);
        if (b) openBlockedProfile(b);
      });
    });
  } catch (e) {
    box.innerHTML = `<p style="padding:24px;color:#c62828">${escapeHtml(e.message)}</p>`;
  }
}

function openBlockedProfile(b) {
  blockedProfileAgentId = b.agent_id;
  $('blocked-profile-photo').src = b.photo_url || '';
  $('blocked-profile-name').textContent = b.display_name || 'Host';
  const reason = (b.reason || '').trim();
  $('blocked-profile-reason').textContent = reason ? `Reason: ${reason}` : 'You blocked this host';
  $('blocked-profile-modal')?.classList.remove('hidden');
}

async function unblockHost(agentId) {
  await api(`/customer/blocks/${agentId}`, { method: 'DELETE' });
  toast('Unblocked');
  $('blocked-profile-modal')?.classList.add('hidden');
  loadBlockedList();
  loadAgents();
}

function bindProfileModals() {
  $('host-menu-close')?.addEventListener('click', () => $('host-menu-sheet')?.classList.add('hidden'));
  $('host-menu-block')?.addEventListener('click', () => {
    $('host-menu-sheet')?.classList.add('hidden');
    $('block-reason').value = '';
    $('block-modal')?.classList.remove('hidden');
  });
  $('block-modal-close')?.addEventListener('click', () => $('block-modal')?.classList.add('hidden'));
  $('block-confirm')?.addEventListener('click', async () => {
    if (!blockTargetAgentId) return;
    try {
      await api(`/customer/blocks/${blockTargetAgentId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: $('block-reason')?.value || '' }),
      });
      followedHostIds = followedHostIds.filter((id) => id !== blockTargetAgentId);
      $('block-modal')?.classList.add('hidden');
      toast('Host blocked');
      navigateScreen('discover');
      loadAgents();
    } catch (e) {
      toast(e.message, true);
    }
  });
  $('btn-change-password')?.addEventListener('click', async () => {
    const current = prompt('Current password:');
    if (!current) return;
    const newPw = prompt('New password (min 6 chars):');
    if (!newPw) return;
    try {
      await api('/customer/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: newPw }),
      });
      toast('Password changed — please log in again');
      customerLogout();
    } catch (e) {
      toast(e.message, true);
    }
  });
  $('btn-disable-account')?.addEventListener('click', async () => {
    if (!confirm('Disable your account? You will not be able to log in.')) return;
    try {
      await api('/customer/disable-account', { method: 'POST' });
      toast('Account disabled');
      customerLogout();
    } catch (e) {
      toast(e.message, true);
    }
  });
  $('btn-delete-account')?.addEventListener('click', async () => {
    const pw = prompt('Permanent delete — enter your password to confirm:');
    if (!pw) return;
    if (!confirm('This cannot be undone. Delete your account?')) return;
    try {
      await api('/customer/account', { method: 'DELETE', body: JSON.stringify({ password: pw }) });
      toast('Account deleted');
      customerLogout();
    } catch (e) {
      toast(e.message, true);
    }
  });
}

async function loadWallet() {
  const data = await api('/customer/wallet');
  updateWallet(data.balance);
}

async function loadHistory() {
  const calls = await api('/customer/calls');
  $('calls-list').innerHTML = calls.length
    ? calls
        .map(
          (c) => `
      <div class="card" style="font-size:0.9rem">
        <strong>${c.agent_name}</strong> — ${c.call_type}
        <div>₹${c.total_charge || 0} · ${c.duration_seconds}s · ${c.status}</div>
        <div style="color:var(--muted);font-size:0.75rem">${new Date(c.created_at).toLocaleString()}</div>
      </div>`
        )
        .join('')
    : '<p style="color:var(--muted)">No calls yet</p>';
}

function updateCallBillingUI(balance, elapsedSec) {
  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  $('call-billing-info').textContent =
    `₹${currentRate}/min · Total charged: ₹${totalChargedThisCall} · Wallet: ₹${(balance ?? 0).toFixed(0)}`;
  $('call-timer').textContent = `Duration ${mins}:${String(secs).padStart(2, '0')}`;
}

let billingIntervalSec = 60;
let freePeriodSec = 60;
let customerSocketBound = false;

function waitForSocket() {
  return new Promise((resolve, reject) => {
    if (socket?.connected) {
      resolve(socket);
      return;
    }
    const onConnect = () => {
      cleanup();
      resolve(socket);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket?.off('connect', onConnect);
      socket?.off('connect_error', onError);
    };
    socket?.once('connect', onConnect);
    socket?.once('connect_error', onError);
    if (!socket?.active) connectSocket();
    setTimeout(() => {
      if (!socket?.connected) {
        cleanup();
        reject(new Error('Connection failed — check internet and reload'));
      }
    }, 30000);
  });
}

function bindCustomerSocketEvents() {
  if (customerSocketBound) return;
  customerSocketBound = true;

  socket.on('call:ringing', ({ callId, rate, callType }) => {
    currentCallId = callId;
    currentRate = rate;
    currentCallType = callType;
    $('call-modal').classList.remove('hidden');
    $('call-status').textContent = `Calling host... ₹${rate}/min`;
    $('btn-unlock-sound')?.classList.remove('hidden');
    CallAlerts?.onOutgoingCall();
  });

  socket.on('call:started', async ({ callId, callType, rate, balance, charged, billingIntervalSec: bis, freePeriodSec: fps }) => {
    currentCallId = callId;
    currentCallType = callType;
    currentRate = rate;
    if (bis) billingIntervalSec = bis;
    if (fps) freePeriodSec = fps;
    $('call-status').textContent = callType === 'video' ? '📹 Video connected' : '📞 Audio connected';
    totalChargedThisCall = charged || 0;
    $('call-timer').textContent = `🎁 First ${freePeriodSec}s FREE — then ₹${rate} every ${billingIntervalSec}s`;
    updateWallet(balance);
    updateCallBillingUI(balance, 0);

    CallAlerts?.stopRinging();
    callEngine = createCallEngine({
      socket,
      callId,
      isCaller: true,
      callType,
      elements: {
        localVideo: $('local-video'),
        remoteVideo: $('remote-video'),
        remoteAudio: $('remote-audio'),
        onError: (msg) => toast(msg, true),
        onConnected: () => {
          CallAlerts?.onCallConnected();
          $('btn-unlock-sound')?.classList.add('hidden');
          $('call-status').textContent = callType === 'video' ? '📹 Connected' : '📞 Connected';
          window._retryCallAudio?.();
        },
      },
    });
    try {
      await callEngine.start();
    } catch {
      endCallUI();
      return;
    }

    let elapsed = 0;
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
      elapsed += 1;
      updateCallBillingUI(getUser()?.wallet_balance ?? 0, elapsed);
    }, 1000);
  });

  socket.on('call:tick', ({ balance, charged, billingIntervalSec: bis }) => {
    totalChargedThisCall += charged;
    updateWallet(balance);
    const sec = bis || billingIntervalSec;
    toast(`₹${charged} cut (${sec}s billed)`);
  });

  socket.on('call:ended', ({ totalCharge, durationSeconds, balance, reason, message }) => {
    CallAlerts?.stopRinging();
    if (balance != null) updateWallet(balance);
    const msg =
      message ||
      (totalCharge != null
        ? `Call end · ₹${totalCharge} · ${durationSeconds || 0}s`
        : reason || 'Call ended');
    CallAlerts?.onCallEnded(msg);
    endCallUI();
    loadWallet();
    if (selectedAgentId) loadChatMessages(selectedAgentId).catch(() => {});
  });

  socket.on('call:error', ({ error }) => {
    toast(error, true);
    endCallUI();
  });

  socket.on('webrtc:signal', async ({ signal }) => {
    if (!callEngine && currentCallId) {
      callEngine = createCallEngine({
        socket,
        callId: currentCallId,
        isCaller: true,
        callType: currentCallType,
        elements: {
          localVideo: $('local-video'),
          remoteVideo: $('remote-video'),
          remoteAudio: $('remote-audio'),
          onError: (msg) => toast(msg, true),
          onConnected: () => {
            CallAlerts?.onCallConnected();
            $('call-status').textContent = '📞 Connected';
          },
        },
      });
    }
    if (callEngine) await callEngine.handleSignal(signal);
  });

  socket.on('message:new', ({ body, from }) => {
    CallAlerts?.onNewMessage(`${from}: ${body?.substring(0, 40) || 'New message'}`);
  });
}

function connectSocket() {
  const token = getToken();
  if (!token) return;
  if (socket) {
    socket.auth = { token };
    bindCustomerSocketEvents();
    if (!socket.connected) socket.connect();
    return;
  }
  socket = io(socketOpts());
  socket.on('connect_error', (err) => toast('Connection: ' + err.message, true));
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') socket.connect();
  });
  bindCustomerSocketEvents();
}

window.startCall = async function (agentId, callType, rate) {
  CallAlerts?.unlock();
  connectSocket();
  currentCallType = callType;
  currentRate = rate;
  $('call-modal').classList.remove('hidden');
  $('call-status').textContent = `Mic allow karo...`;
  $('call-timer').textContent = `₹${rate}/min · 1st minute FREE`;
  $('call-billing-info').textContent = '';
  $('local-video').classList.add('hidden');
  $('remote-video').classList.add('hidden');
  $('remote-audio').classList.add('hidden');
  $('btn-unlock-sound')?.classList.remove('hidden');
  try {
    // Must run inside this tap — iOS blocks getUserMedia later in socket handlers
    if (typeof prepareCallMedia === 'function') {
      await prepareCallMedia(callType);
    }
    await waitForSocket();
    $('call-status').textContent = `Requesting ${callType} call...`;
    socket.emit('call:request', { agentId, callType });
  } catch (e) {
    toast(e.message || 'Mic/Camera allow karo', true);
    endCallUI();
  }
};

$('btn-unlock-sound')?.addEventListener('click', async () => {
  CallAlerts?.unlock();
  if (typeof window._retryCallMedia === 'function') {
    const ok = await window._retryCallMedia();
    if (ok) $('btn-unlock-sound')?.classList.add('hidden');
  } else {
    window._retryCallAudio?.();
    $('btn-unlock-sound')?.classList.add('hidden');
  }
});

$('btn-end-call').onclick = () => {
  if (socket && currentCallId) socket.emit('call:end', { callId: currentCallId });
  else endCallUI();
};

function endCallUI() {
  CallAlerts?.stopRinging();
  clearInterval(callTimerInterval);
  $('call-modal').classList.add('hidden');
  if (callEngine) callEngine.stop();
  callEngine = null;
  currentCallId = null;
  loadAgents().catch(() => {});
}

async function applyUserFeatures() {
  await loadPlatformFeatures('user');
}

function showMain() {
  $('auth-view')?.classList.add('hidden');
  $('main-view')?.classList.remove('hidden');
  document.body.classList.add('fc-customer');
  const u = getUser();
  updateWallet(u?.wallet_balance || 0);
  connectSocket();
  loadAgents().catch((e) => toast(e.message, true));
  navigateScreen('discover');
  applyUserFeatures().catch(() => {});
}

$('btn-random-match')?.addEventListener('click', () => {
  randomFilterActive = true;
  document.querySelectorAll('.fc-topbar-tab').forEach((t) => t.classList.remove('active'));
  document.querySelector('.fc-topbar-tab[data-list="all"]')?.classList.add('active');
  listTab = 'all';
  const banner = $('random-filter-banner');
  if (banner) {
    banner.textContent = `💎 Random Match — hosts near ${RANDOM_MATCH_RATE}/min (tap TALK NOW on a host to call)`;
    banner.classList.remove('hidden');
  }
  renderAgentList();
  const n = getFilteredAgents().length;
  toast(n ? `${n} hosts in this range` : 'No hosts in this range', !n);
  navigateScreen('discover');
});

async function enterCustomerApp(userHint) {
  const token = localStorage.getItem('customer_token') || getToken();
  let u = userHint;
  if (!u) {
    try {
      u = JSON.parse(localStorage.getItem('customer_user') || 'null') || getUser();
    } catch {
      u = getUser();
    }
  }
  if (token && u) setAuth(token, u);
  if (u?.role && u.role !== 'customer') {
    showLoginError('This is a host account — log in at /agent');
    return;
  }
  showMain();
}

window.enterCustomerApp = enterCustomerApp;
window.showMain = showMain;

async function initCustomerApp() {
  const activeSort = document.querySelector('#filter-sort .fc-pill.active');
  if (activeSort) priceSort = activeSort.dataset.sort || priceSort;
  bindAuth();
  bindBottomNav();
  bindListTabs();
  bindFilterModal();
  bindTalkNowModal();
  bindBottomSheets();

  const token = localStorage.getItem('customer_token') || getToken();
  let u = null;
  try {
    u = JSON.parse(localStorage.getItem('customer_user') || 'null') || getUser();
  } catch {
    u = getUser();
  }
  if (token && u?.role === 'customer') {
    const ok = await validateSession('customer');
    if (ok) showMain();
    else {
      showLoginError('Session expired — please log in again');
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomerApp);
} else {
  initCustomerApp();
}

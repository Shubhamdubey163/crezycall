let socket;
let incomingCallId;
let currentCallId;
let callEngine = null;
let callType = 'audio';
let currentRate = 0;

const $ = (id) => document.getElementById(id);

function bindTabs() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    ['earnings', 'statement', 'calls', 'messages', 'profile'].forEach((n) => {
      $(`tab-${n}`)?.classList.toggle('hidden', t.dataset.tab !== n);
    });
    if (t.dataset.tab === 'calls' || t.dataset.tab === 'earnings') {
      loadEarnings();
      loadRecentContacts();
    }
    if (t.dataset.tab === 'messages') loadMessages();
    if (t.dataset.tab === 'statement') loadAgentStatement();
    if (t.dataset.tab === 'profile') loadProfileForm();
    });
  });
}

let regEmail = '';
let faceScanData = {};
let regVerifyPhoto = null;
let profPhotoData = null;
let setupPhotoData = null;
let inboxCache = [];
let activeChatCustomerId = null;

function showRegStep(step) {
  ['login-form', 'register-step1', 'register-step2', 'register-step3', 'register-done'].forEach((id) => {
    $(id)?.classList.add('hidden');
  });
  $(step)?.classList.remove('hidden');
}

$('show-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  showRegStep('register-step1');
});
$('show-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  showRegStep('login-form');
});
$('reg-back-1')?.addEventListener('click', (e) => { e.preventDefault(); showRegStep('register-step1'); });
$('reg-back-2')?.addEventListener('click', (e) => { e.preventDefault(); showRegStep('register-step2'); });
$('btn-reg-done-login')?.addEventListener('click', () => showRegStep('login-form'));

$('btn-reg-next')?.addEventListener('click', async () => {
  try {
    await api('/auth/register/agent/step1', {
      method: 'POST',
      body: JSON.stringify({
        name: $('reg-name').value,
        phone: $('reg-phone').value,
        email: $('reg-email').value,
        password: $('reg-password').value,
        display_name: $('reg-display').value,
        age: $('reg-age').value,
      }),
    });
    regEmail = $('reg-email').value;
    showRegStep('register-step2');
    $('face-verify-box').innerHTML = '';
    createFaceVerifier($('face-verify-box'), (captures) => {
      faceScanData = Object.entries(captures).map(([pose, image]) => ({ pose, image }));
      showRegStep('register-step3');
    });
  } catch (e) {
    toast(e.message, true);
  }
});

$('reg-photo-file')?.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    regVerifyPhoto = await cropPortraitForProfile(f, 640);
    const prev = $('reg-photo-preview');
    if (prev) {
      prev.src = regVerifyPhoto;
      prev.style.display = 'block';
    }
  } catch (err) {
    toast(err.message, true);
    e.target.value = '';
  }
});

$('btn-reg-finish')?.addEventListener('click', async () => {
  if (!regVerifyPhoto || regVerifyPhoto.length < 100) {
    toast('Verification photo required', true);
    return;
  }
  try {
    await api('/auth/register/agent/verify', {
      method: 'POST',
      body: JSON.stringify({
        email: regEmail,
        face_scan_data: faceScanData,
        verification_photo_url: regVerifyPhoto,
      }),
    });
    regVerifyPhoto = null;
    showRegStep('register-done');
  } catch (e) {
    toast(e.message, true);
  }
});

$('btn-logout')?.addEventListener('click', logout);

$('online-switch')?.addEventListener('click', async () => {
  const sw = $('online-switch');
  const newState = !sw.classList.contains('on');
  try {
    await api('/agent/online', {
      method: 'PATCH',
      body: JSON.stringify({ is_online: newState }),
    });
    sw.classList.toggle('on', newState);
    toast(newState ? 'You are online' : 'You are offline');
  } catch (e) {
    toast(e.message, true);
  }
});

$('btn-withdraw')?.addEventListener('click', async () => {
  try {
    const data = await api('/agent/withdraw', { method: 'POST', body: '{}' });
    toast(`Withdrawal: ₹${data.net} (fee ₹${data.platform_fee})`);
    loadEarnings();
  } catch (e) {
    toast(e.message, true);
  }
});

async function loadAgentStatement() {
  const s = await api('/agent/statement');
  $('statement-list').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">₹${s.total_earnings.toFixed(0)}</div><div class="stat-label">Total Earned</div></div>
      <div class="stat-card"><div class="stat-value">₹${s.available_balance.toFixed(0)}</div><div class="stat-label">Available</div></div>
    </div>
    <div class="statement-section">
      <h4>📞 Calls</h4>
      ${s.calls.length ? s.calls.map((c) => `
        <div class="card" style="padding:10px;font-size:0.85rem;margin-bottom:8px">
          <strong>${c.customer_name}</strong><br>
          ${c.call_type} · ${c.talk_seconds || 0}s · Earned ₹${c.agent_earning || 0}
          <div style="color:var(--muted);font-size:0.75rem">${new Date(c.created_at).toLocaleString()}</div>
        </div>`).join('') : '<p style="color:var(--muted)">No calls yet</p>'}
    </div>
    <div class="statement-section">
      <h4>💬 Messages & Gifts</h4>
      ${s.messages.length ? s.messages.map((m) => `
        <div class="card" style="padding:10px;font-size:0.85rem;margin-bottom:8px">
          <strong>${m.customer_name}</strong>
          ${m.msg_type === 'gift' ? ' 🎁' : ''}: ${m.body.substring(0, 60)}
          ${parseFloat(m.gift_charge || m.gist_charge) > 0 ? ' · ₹' + (m.gift_charge || m.gist_charge) : ''}
          <div style="color:var(--muted);font-size:0.75rem">${new Date(m.created_at).toLocaleString()}</div>
        </div>`).join('') : '<p style="color:var(--muted)">No messages yet</p>'}
    </div>`;
}

function formatLastActive(iso) {
  if (!iso) return 'No activity';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Active just now';
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Active ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Active ${days}d ago`;
  return d.toLocaleDateString();
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function userInitial(name) {
  return (name || 'U').trim()[0]?.toUpperCase() || 'U';
}

async function refreshInbox() {
  inboxCache = await api('/agent/messages/inbox');
  return inboxCache;
}

function renderChatBubbles(messages) {
  if (!messages?.length) {
    return '<p class="chat-empty">No messages yet — send the first message</p>';
  }
  return messages
    .map((m) => {
      const out = m.sender_role === 'agent';
      return `<div class="wa-bubble ${out ? 'out' : 'in'}">
        ${m.msg_type === 'gift' ? '🎁 ' : ''}${esc(m.body)}
        <div class="wa-bubble-time">${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>`;
    })
    .join('');
}

async function openChat(customerId, customerName, lastActive) {
  activeChatCustomerId = customerId;
  const name = customerName || 'User';
  if ($('chat-title')) $('chat-title').textContent = name;
  if ($('chat-subtitle')) $('chat-subtitle').textContent = formatLastActive(lastActive);
  if ($('chat-avatar')) $('chat-avatar').textContent = userInitial(name);
  if ($('chat-messages')) $('chat-messages').innerHTML = '<p class="chat-empty">Loading...</p>';
  $('main-view')?.classList.add('hidden');
  $('chat-screen')?.classList.remove('hidden');
  if ($('chat-reply-input')) $('chat-reply-input').value = '';

  try {
    const thread = await api(`/agent/messages/thread/${customerId}`);
    if (thread.customer_label && $('chat-title')) $('chat-title').textContent = thread.customer_label;
    if ($('chat-messages')) {
      $('chat-messages').innerHTML = renderChatBubbles(thread.messages);
      $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
    }
  } catch (e) {
    if ($('chat-messages')) $('chat-messages').innerHTML = `<p class="chat-empty">${esc(e.message)}</p>`;
  }
}

function closeChat() {
  activeChatCustomerId = null;
  $('chat-screen')?.classList.add('hidden');
  $('main-view')?.classList.remove('hidden');
}

window.openChat = openChat;
window.closeChat = closeChat;

window.openChatById = async function (customerId) {
  let name = 'User';
  let lastActive = '';
  const t = inboxCache.find((x) => x.customer_id === customerId);
  if (t) {
    name = t.customer_label || t.customer_name;
    const last = t.messages[t.messages.length - 1];
    lastActive = last?.created_at || '';
  }
  await openChat(customerId, name, lastActive);
};

async function sendChatReply() {
  const body = ($('chat-reply-input')?.value || '').trim();
  if (!body || !activeChatCustomerId) return;
  try {
    await api('/agent/messages/reply', {
      method: 'POST',
      body: JSON.stringify({ customer_id: activeChatCustomerId, body }),
    });
    $('chat-reply-input').value = '';
    const thread = await api(`/agent/messages/thread/${activeChatCustomerId}`);
    if ($('chat-messages')) {
      $('chat-messages').innerHTML = renderChatBubbles(thread.messages);
      $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
    }
    await refreshInbox();
    loadMessages();
    loadRecentContacts();
  } catch (e) {
    toast(e.message, true);
  }
}

function bindChatUi() {
  $('chat-back')?.addEventListener('click', closeChat);
  $('chat-send-btn')?.addEventListener('click', sendChatReply);
  $('chat-reply-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChatReply();
    }
  });
}

async function loadMessages() {
  try {
    await refreshInbox();
    $('messages-list').innerHTML = inboxCache.length
      ? inboxCache
          .map((t) => {
            const last = t.messages[t.messages.length - 1];
            const preview = (last?.body || '').substring(0, 45);
            const active = formatLastActive(last?.created_at);
            const cid = t.customer_id;
            const name = esc(t.customer_label || t.customer_name);
            return `<button type="button" class="msg-inbox-card" onclick="openChatById('${cid}')">
              <div class="msg-inbox-avatar">${userInitial(t.customer_name)}</div>
              <div class="msg-inbox-meta">
                <div class="msg-inbox-row">
                  <strong>${name}</strong>
                  <span class="msg-inbox-time">${active}</span>
                </div>
                <div class="msg-inbox-preview">${esc(preview) || 'Tap to open chat'}</div>
              </div>
              <span class="msg-inbox-icon" aria-hidden="true">💬</span>
            </button>`;
          })
          .join('')
      : '<p style="color:var(--muted);padding:12px">No messages yet</p>';
  } catch (e) {
    toast(e.message, true);
  }
}

window.replyTo = async function (customerId, name) {
  openChat(customerId, name);
};

async function loadRecentContacts() {
  try {
    const list = await api('/agent/recent-contacts');
    if (!list.length) {
      $('recent-contacts-host')?.classList.add('hidden');
      return;
    }
    $('recent-contacts-host')?.classList.remove('hidden');
    $('recent-contacts-list').innerHTML = list
      .map((c) => {
        const name = esc(c.customer_name);
        const active = formatLastActive(c.last_contact_at);
        return `<div class="recent-user-tile">
          <div class="recent-user-avatar">${userInitial(c.customer_name)}</div>
          <div class="recent-user-name">${name}</div>
          <div class="recent-user-active">${active}</div>
          <button type="button" class="recent-user-msg-btn" title="Open chat" onclick="openChatById('${c.customer_id}')">💬</button>
        </div>`;
      })
      .join('');
  } catch {
    $('recent-contacts-host')?.classList.add('hidden');
  }
}

window.nudgeUser = async function (customerId, type) {
  try {
    await api('/agent/messages/nudge', {
      method: 'POST',
      body: JSON.stringify({ customer_id: customerId, nudge_type: type }),
    });
    toast('Message sent!');
    loadMessages();
  } catch (e) {
    toast(e.message, true);
  }
};

async function loadProfileForm() {
  const p = await api('/agent/profile');
  $('prof-display').value = p.display_name || '';
  $('prof-bio').value = p.bio || '';
  $('prof-topics').value = p.teaching_topics || '';
  $('prof-lang').value = p.languages || '';
  $('prof-age').value = p.age || 22;
  profPhotoData = null;
  if ($('prof-photo-preview')) $('prof-photo-preview').src = p.photo_url || 'https://i.pravatar.cc/300?img=32';
  if ($('prof-photo-file')) $('prof-photo-file').value = '';
}

$('prof-photo-file')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    profPhotoData = await cropPortraitForProfile(file);
    if ($('prof-photo-preview')) $('prof-photo-preview').src = profPhotoData;
  } catch (err) {
    toast(err.message, true);
    e.target.value = '';
  }
});

async function saveAgentProfile(extraPhoto) {
  const payload = {
    display_name: $('prof-display')?.value || $('setup-display')?.value,
    bio: $('prof-bio')?.value || '',
    teaching_topics: $('prof-topics')?.value || '',
    languages: $('prof-lang')?.value || '',
    age: $('prof-age')?.value || 22,
  };
  const photo = extraPhoto || profPhotoData;
  if (photo) payload.photo_url = photo;
  try {
    await api('/agent/profile', { method: 'PATCH', body: JSON.stringify(payload) });
  } catch (e) {
    if (e.message?.includes('restart') || e.message?.includes('Cannot')) {
      await api('/agent/profile', { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      throw e;
    }
  }
}

$('btn-save-profile')?.addEventListener('click', async () => {
  const btn = $('btn-save-profile');
  if (!profPhotoData && $('prof-display')?.value?.trim()) {
    const preview = $('prof-photo-preview')?.src || '';
    if (preview.includes('pravatar.cc') || preview.includes('default-avatar')) {
      return toast('Upload a display photo', true);
    }
  }
  setButtonLoading(btn, true, 'Saving...');
  try {
    await saveAgentProfile();
    toast('Display profile saved!');
    await loadProfile();
    loadProfileForm().catch(() => {});
  } catch (e) {
    toast(e.message, true);
  } finally {
    setButtonLoading(btn, false);
  }
});

async function loadEarnings() {
  const data = await api('/agent/earnings');
  $('total-earn').textContent = `₹${data.total_earnings.toFixed(0)}`;
  $('avail-balance').textContent = `₹${data.available_balance.toFixed(0)}`;
  $('fee-pct').textContent = `${data.platform_fee_percent}%`;

  $('calls-list').innerHTML = data.calls.length
    ? data.calls
        .map(
          (c) => `
      <div class="card" style="font-size:0.85rem;padding:10px">
        ${c.call_type} — earned ₹${c.agent_earning || 0} · ${c.duration_seconds}s
        <div style="color:var(--muted);font-size:0.75rem">${new Date(c.created_at).toLocaleString()}</div>
      </div>`
        )
        .join('')
    : '<p style="color:var(--muted)">No calls</p>';

  $('withdrawals-list').innerHTML =
    '<h4 style="margin:16px 0 8px">Withdrawals</h4>' +
    (data.withdrawals.length
      ? data.withdrawals
          .map(
            (w) => `
        <div class="card" style="padding:10px;font-size:0.85rem">
          ₹${w.gross_amount} gross → ₹${w.net_amount} net (fee ₹${w.platform_fee})
          <span class="status-${w.status}"> ${w.status}</span> — ${w.month_label}
        </div>`
          )
          .join('')
      : '<p style="color:var(--muted)">No withdrawals yet</p>');
}

function connectSocket() {
  const token = getToken();
  if (!token) return;
  if (socket) {
    socket.auth = { token };
    bindAgentSocketEvents();
    if (!socket.connected) socket.connect();
    return;
  }
  socket = io(socketOpts());
  socket.on('connect_error', (err) => toast('Connection: ' + err.message, true));
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') socket.connect();
  });
  bindAgentSocketEvents();
}

let agentSocketBound = false;
function bindAgentSocketEvents() {
  if (agentSocketBound) return;
  agentSocketBound = true;

  socket.on('call:incoming', ({ callId, customerName, customerAge, customerGender, callType: ct, rate }) => {
    incomingCallId = callId;
    callType = ct;
    currentRate = rate;
    const who =
      customerAge != null
        ? `${customerName}, ${customerAge}${customerGender ? ` · ${customerGender}` : ''}`
        : customerName;
    $('incoming-info').textContent = `${who} — ${ct} call @ ₹${rate}/min`;
    $('incoming-modal').classList.remove('hidden');
    CallAlerts?.onIncomingCall();
  });

  socket.on('call:started', async ({ callId, callType: ct, rate }) => {
    currentCallId = callId;
    callType = ct;
    currentRate = rate;
    incomingCallId = null;
    $('incoming-modal').classList.add('hidden');
    $('active-call-modal').classList.remove('hidden');
    $('btn-unlock-sound')?.classList.remove('hidden');
    $('agent-billing-info').textContent = `${ct} call · ₹${rate}/min`;
    $('agent-call-timer').textContent = 'Waiting for user media...';

    CallAlerts?.stopRinging();
    callEngine = createCallEngine({
      socket,
      callId,
      isCaller: false,
      callType: ct,
      elements: {
        localVideo: $('local-video'),
        remoteVideo: $('remote-video'),
        remoteAudio: $('remote-audio'),
        onError: (msg) => toast(msg, true),
        onConnected: () => {
          CallAlerts?.onCallConnected();
          $('btn-unlock-sound')?.classList.add('hidden');
          $('agent-call-timer').textContent = 'Connected';
          window._retryCallAudio?.();
        },
      },
    });
    try {
      await callEngine.start();
    } catch {
      cleanupMedia();
    }
  });

  socket.on('call:tick', ({ earned }) => {
    $('agent-call-timer').textContent = `+₹${earned} earned this minute`;
    loadEarnings();
  });

  socket.on('call:ended', ({ totalCharge, message, reason }) => {
    CallAlerts?.stopRinging();
    $('active-call-modal').classList.add('hidden');
    cleanupMedia();
    const msg = message || (totalCharge != null ? `Call end · ₹${totalCharge}` : reason || 'Call ended');
    CallAlerts?.onCallEnded(msg);
    loadEarnings();
  });

  socket.on('webrtc:signal', async ({ signal }) => {
    if (!callEngine && currentCallId) {
      callEngine = createCallEngine({
        socket,
        callId: currentCallId,
        isCaller: false,
        callType,
        elements: {
          localVideo: $('local-video'),
          remoteVideo: $('remote-video'),
          remoteAudio: $('remote-audio'),
          onError: (msg) => toast(msg, true),
          onConnected: () => {
            CallAlerts?.onCallConnected();
            $('agent-call-timer').textContent = 'Connected';
          },
        },
      });
    }
    if (callEngine) await callEngine.handleSignal(signal);
  });

  socket.on('message:new', ({ body, from }) => {
    CallAlerts?.onNewMessage(`💬 ${from}: ${body?.substring(0, 40) || 'New message'}`);
    loadMessages().catch(() => {});
    loadRecentContacts().catch(() => {});
  });
}

function cleanupMedia() {
  CallAlerts?.stopRinging();
  if (callEngine) callEngine.stop();
  callEngine = null;
  currentCallId = null;
}

function bindCallButtons() {
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

  $('btn-accept')?.addEventListener('click', async () => {
    CallAlerts?.unlock();
    CallAlerts?.stopRinging();
    try {
      // iOS: get mic on Accept tap, before socket round-trip
      if (typeof prepareCallMedia === 'function') {
        await prepareCallMedia(callType || 'audio');
      }
    } catch (e) {
      toast(e.message || 'Mic allow karo phir Accept dabao', true);
      return;
    }
    if (socket && incomingCallId) {
      socket.emit('call:accept', { callId: incomingCallId });
      currentCallId = incomingCallId;
    }
  });
  $('btn-reject')?.addEventListener('click', () => {
    CallAlerts?.stopRinging();
    if (socket && incomingCallId) socket.emit('call:reject', { callId: incomingCallId });
    $('incoming-modal').classList.add('hidden');
    incomingCallId = null;
  });
  $('btn-end-call')?.addEventListener('click', () => {
    if (socket && currentCallId) socket.emit('call:end', { callId: currentCallId });
    $('active-call-modal').classList.add('hidden');
    cleanupMedia();
  });
}

async function applyHostFeatures() {
  await loadPlatformFeatures('host');
  if (!isFeatureOn('statement')) document.querySelector('[data-tab="statement"]')?.remove();
}

function showPendingView(agent) {
  $('auth-view').classList.remove('hidden');
  $('main-view').classList.add('hidden');
  showRegStep('login-form');
  showLoginError(
    `Logged in, but account is "${agent.status}". Admin must approve before you receive calls. ` +
      `For testing use host@crezycall.com / host123 (do not sign up).`
  );
}

async function autoGoOnlineIfApproved() {
  try {
    const p = await api('/agent/profile');
    if (p.status === 'approved' && !p.is_online) {
      await api('/agent/online', { method: 'PATCH', body: JSON.stringify({ is_online: true }) });
      $('online-switch')?.classList.add('on');
    }
  } catch {
    /* ignore */
  }
}

function showDisplayProfileSetup(profile) {
  setupPhotoData = null;
  if ($('setup-display')) $('setup-display').value = profile.display_name || '';
  if ($('setup-photo-preview')) {
    $('setup-photo-preview').src = profile.photo_url || 'https://i.pravatar.cc/300?img=32';
  }
  $('display-profile-modal')?.classList.remove('hidden');
}

$('setup-photo-file')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    setupPhotoData = await cropPortraitForProfile(file);
    if ($('setup-photo-preview')) $('setup-photo-preview').src = setupPhotoData;
  } catch (err) {
    toast(err.message, true);
    e.target.value = '';
  }
});

$('btn-setup-save')?.addEventListener('click', async () => {
  const name = $('setup-display')?.value?.trim();
  if (!name) return toast('Enter display name', true);
  if (!setupPhotoData) return toast('Upload a display photo with your face clearly visible', true);
  const btn = $('btn-setup-save');
  setButtonLoading(btn, true, 'Saving...');
  try {
    await api('/agent/profile', {
      method: 'PATCH',
      body: JSON.stringify({ display_name: name, photo_url: setupPhotoData }),
    });
    $('display-profile-modal')?.classList.add('hidden');
    setupPhotoData = null;
    toast('Display profile saved!');
    await loadProfile();
    loadProfileForm().catch(() => {});
    autoGoOnlineIfApproved();
  } catch (e) {
    toast(e.message, true);
  } finally {
    setButtonLoading(btn, false);
  }
});

async function enterHostApp(agentHint) {
  const token = localStorage.getItem('host_token') || getToken();
  if (token && typeof setAuth === 'function') {
    try {
      const u = JSON.parse(localStorage.getItem('host_user') || '{}');
      setAuth(token, u.id ? u : getUser());
    } catch {
      setAuth(token, getUser());
    }
  }

  let profile;
  try {
    profile = await api('/agent/profile');
  } catch (e) {
    if (typeof showLoginError === 'function') showLoginError(e.message);
    else alert(e.message);
    return;
  }

  localStorage.setItem('host_agent', JSON.stringify(profile));

  if (profile.status !== 'approved') {
    showPendingView(profile);
    return;
  }

  $('auth-view').classList.add('hidden');
  $('main-view').classList.remove('hidden');
  document.body.style.background = '';
  clearLoginError();
  connectSocket();
  renderProfile(profile);
  loadEarnings().catch(() => {});
  loadRecentContacts().catch(() => {});
  if (profile.needs_display_profile) {
    showDisplayProfileSetup(profile);
  } else {
    autoGoOnlineIfApproved();
  }
  applyHostFeatures().catch(() => {});
}

function renderProfile(p) {
  $('status-badge').textContent = p.status;
  $('status-badge').style.background =
    p.status === 'approved' ? 'var(--green)' : p.status === 'pending' ? 'var(--gold)' : 'var(--danger)';
  $('profile-card').innerHTML = `
    <div style="display:flex;gap:14px;align-items:center">
      <img src="${p.photo_url}" class="avatar-face" style="width:64px;height:64px;border-radius:50%;border:2px solid var(--accent2)">
      <div>
        <strong>${p.display_name}</strong>, ${p.age} yrs<br>
        <span class="rate-tag audio">Audio ₹${p.audio_rate}/min</span>
        <span class="rate-tag video">Video ₹${p.video_rate}/min</span>
        <p style="font-size:0.8rem;color:var(--muted);margin-top:6px">${p.needs_display_profile ? 'Set display photo in Profile tab' : (p.status_message || '')}</p>
      </div>
    </div>`;
  $('online-switch').classList.toggle('on', p.is_online);
  if (p.status !== 'approved') {
    $('online-switch').style.opacity = '0.5';
    $('online-switch').style.pointerEvents = 'none';
  } else {
    $('online-switch').style.opacity = '1';
    $('online-switch').style.pointerEvents = 'auto';
  }
}

async function loadProfile() {
  const p = await api('/agent/profile');
  renderProfile(p);
}

function initHostPage() {
  const t = localStorage.getItem('host_token') || getToken();
  let u = null;
  try {
    u = JSON.parse(localStorage.getItem('host_user') || 'null') || getUser();
  } catch {
    u = getUser();
  }
  if (t && u && u.role !== 'agent') {
    localStorage.removeItem('host_token');
    localStorage.removeItem('host_user');
    if (typeof showLoginError === 'function') {
      showLoginError('You were on User login — sign in again as Host');
    }
    return;
  }
  if (t && u?.role === 'agent') {
    validateSession('agent')
      .then((ok) => {
        if (ok) return enterHostApp();
        clearPortalAuth();
      })
      .catch((e) => {
        if (typeof showLoginError === 'function') showLoginError(e.message);
        else alert(e.message);
      });
  }
}

window.enterHostApp = enterHostApp;

function bootAgentApp() {
  try {
    bindTabs();
    bindCallButtons();
    bindChatUi();
    initHostPage();
  } catch (e) {
    console.error('Agent app boot error:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAgentApp);
} else {
  bootAgentApp();
}

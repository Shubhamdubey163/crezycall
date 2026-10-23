/**
 * Forgot / reset password modal — customer & host login pages
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function ensureModal() {
    if ($('forgot-modal')) return;
    const html = `
    <div id="forgot-modal" class="modal-overlay hidden">
      <div class="modal" style="max-width:400px">
        <button type="button" class="detail-close" id="forgot-close">✕</button>
        <h2 style="margin-bottom:8px">Forgot Password</h2>
        <p style="color:var(--muted);font-size:0.85rem;margin-bottom:12px">A 6-digit code will be sent to your email (demo: shown on screen)</p>
        <div id="forgot-step1">
          <label style="font-size:0.8rem;color:var(--muted)">Email</label>
          <input type="email" id="forgot-email" placeholder="your@email.com" style="width:100%;margin:8px 0 12px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
          <button type="button" class="btn btn-primary" id="btn-forgot-send" style="width:100%">Send Code</button>
        </div>
        <div id="forgot-step2" class="hidden">
          <p id="forgot-code-hint" style="font-size:0.85rem;color:var(--green);margin-bottom:10px"></p>
          <label style="font-size:0.8rem;color:var(--muted)">6-digit code</label>
          <input type="text" id="forgot-code" maxlength="6" placeholder="123456" style="width:100%;margin:8px 0 12px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
          <label style="font-size:0.8rem;color:var(--muted)">New password</label>
          <input type="password" id="forgot-new-pass" placeholder="Min 6 characters" style="width:100%;margin:8px 0 12px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
          <button type="button" class="btn btn-primary" id="btn-forgot-reset" style="width:100%">Reset Password</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    $('forgot-close')?.addEventListener('click', closeForgot);
    $('forgot-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'forgot-modal') closeForgot();
    });

    $('btn-forgot-send')?.addEventListener('click', async () => {
      const email = ($('forgot-email')?.value || '').trim().toLowerCase();
      if (!email) return toast('Enter email', true);
      try {
        const data = await api('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
          skipAuth: true,
        });
        $('forgot-step1')?.classList.add('hidden');
        $('forgot-step2')?.classList.remove('hidden');
        const hint = data.reset_code
          ? `Demo code (15 min): ${data.reset_code}`
          : data.message || 'Code sent';
        if ($('forgot-code-hint')) $('forgot-code-hint').textContent = hint;
        toast(hint);
      } catch (e) {
        toast(e.message, true);
      }
    });

    $('btn-forgot-reset')?.addEventListener('click', async () => {
      const email = ($('forgot-email')?.value || '').trim().toLowerCase();
      const code = ($('forgot-code')?.value || '').trim();
      const password = $('forgot-new-pass')?.value || '';
      if (!code || !password) return toast('Enter code and password', true);
      try {
        const data = await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email, code, password }),
          skipAuth: true,
        });
        toast(data.message || 'Password updated!');
        closeForgot();
        if ($('login-email')) $('login-email').value = email;
        if ($('login-password')) $('login-password').value = '';
      } catch (e) {
        toast(e.message, true);
      }
    });
  }

  function openForgot(email) {
    ensureModal();
    $('forgot-step1')?.classList.remove('hidden');
    $('forgot-step2')?.classList.add('hidden');
    if ($('forgot-email')) $('forgot-email').value = email || $('login-email')?.value || '';
    if ($('forgot-code')) $('forgot-code').value = '';
    if ($('forgot-new-pass')) $('forgot-new-pass').value = '';
    $('forgot-modal')?.classList.remove('hidden');
  }

  function closeForgot() {
    $('forgot-modal')?.classList.add('hidden');
  }

  function bindForgotLinks() {
    document.querySelectorAll('[data-forgot-password], a[href="#forgot"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openForgot();
      });
    });
    const footerLink = document.querySelector('#login-form a[href="#"]');
    if (footerLink?.textContent?.toLowerCase().includes('forgot')) {
      footerLink.id = 'link-forgot';
      footerLink.href = '#forgot';
      footerLink.setAttribute('data-forgot-password', '1');
      footerLink.addEventListener('click', (e) => {
        e.preventDefault();
        openForgot();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindForgotLinks);
  } else {
    bindForgotLinks();
  }

  window.openForgotPassword = openForgot;
})();

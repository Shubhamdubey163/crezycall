/**
 * Host login — reliable (app.js crash ho to bhi)
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function showErr(msg) {
    const el = $('login-error');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
      el.style.display = 'block';
    }
    if (typeof showLoginError === 'function') showLoginError(msg);
    else if (typeof toast === 'function') toast(msg, true);
    else alert(msg);
  }

  async function hostLogin() {
    const btn = $('btn-login');
    const email = ($('login-email')?.value || '').trim().toLowerCase();
    const password = $('login-password')?.value || '';
    if (!email || !password) {
      showErr('Enter email and password');
      return;
    }
    if (typeof clearLoginError === 'function') clearLoginError();
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Signing in...';
    }
    try {
      const data =
        typeof authLogin === 'function'
          ? await authLogin(email, password)
          : await (async () => {
              const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
              });
              const text = await res.text();
              let json = {};
              try {
                json = JSON.parse(text);
              } catch {
                throw new Error('Server error — restart: node server/index.js');
              }
              if (!res.ok) throw new Error(json.error || 'Login failed');
              return json;
            })();

      if (data.user?.role !== 'agent') {
        throw new Error('This is a customer account — log in at /customer (user@demo.com)');
      }
      if (!data.agent) throw new Error('Host profile not found — ask admin to approve your account');

      if (typeof setAuth === 'function') {
        setAuth(data.token, data.user);
      }
      localStorage.setItem('host_token', data.token);
      localStorage.setItem('host_user', JSON.stringify(data.user));
      localStorage.setItem('host_agent', JSON.stringify(data.agent));
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('customer_token');
      localStorage.removeItem('customer_user');

      if (typeof window.enterHostApp === 'function') {
        await window.enterHostApp(data.agent);
      } else {
        window.location.reload();
      }
    } catch (e) {
      showErr(e.message || 'Login error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    }
  }

  function bind() {
    const btnLogin = $('btn-login');
    const btnQuick = $('btn-quick');
    if (btnLogin) {
      btnLogin.type = 'button';
      btnLogin.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hostLogin();
      });
    }
    if (btnQuick) {
      btnQuick.type = 'button';
      btnQuick.addEventListener('click', (e) => {
        e.preventDefault();
        $('login-email').value = 'host@crezycall.com';
        $('login-password').value = 'host123';
        hostLogin();
      });
    }
    $('login-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        hostLogin();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
  window.hostLogin = hostLogin;
})();

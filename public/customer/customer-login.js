/**
 * User login — hamesha kaam kare (app.js se pehle load)
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  async function customerLogin() {
    const btn = $('btn-login');
    const email = ($('login-email')?.value || '').trim().toLowerCase();
    const password = $('login-password')?.value || '';
    if (!email || !password) {
      if (typeof showLoginError === 'function') showLoginError('Enter email and password');
      else alert('Enter email and password');
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

      if (data.user?.role !== 'customer') {
        throw new Error('This is a host account — go to /agent (host@crezycall.com)');
      }

      localStorage.setItem('customer_token', data.token);
      localStorage.setItem('customer_user', JSON.stringify(data.user));
      localStorage.removeItem('host_token');
      localStorage.removeItem('host_user');
      localStorage.removeItem('host_agent');
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      if (typeof setAuth === 'function') setAuth(data.token, data.user);

      if (typeof window.enterCustomerApp === 'function') {
        await window.enterCustomerApp(data.user);
      } else if (typeof showMain === 'function') {
        showMain();
      } else {
        window.location.reload();
      }
    } catch (e) {
      const msg = e.message || 'Login failed';
      if (typeof showLoginError === 'function') showLoginError(msg);
      if (typeof toast === 'function') toast(msg, true);
      else alert(msg);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    }
  }

  function bind() {
    $('btn-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      customerLogin();
    });
    $('login-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        customerLogin();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
  window.customerLogin = customerLogin;
})();

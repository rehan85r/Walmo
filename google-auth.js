/* Google Identity Services: the visible Google button is rendered by Google. */
(function () {
  let clientId = '';
  let signedIn = false;
  let overlay;
  let email = '';

  function wipeLocalChats() {
    ['walmo_chat_recents_v1', 'walmo_chat_trash_v1', 'walmo_reply_preferences_v1', 'walrus_mind_anonymous_id']
      .forEach(key => localStorage.removeItem(key));
  }
  function message(text) {
    const status = overlay?.querySelector('.walmo-google-status');
    if (status) status.textContent = text;
  }
  async function api(body) {
    const res = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Sign-in failed');
    return data;
  }
  function close() {
    overlay?.remove();
    overlay = null;
  }
  async function logout() {
    try {
      await api({ action: 'logout' });
      window.google?.accounts?.id?.disableAutoSelect?.();
      wipeLocalChats();
      location.reload();
    } catch (error) { message(error.message); throw error; }
  }
  window.walmoGoogleLogout = logout;
  function createDialog() {
    close();
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(8,16,42,.55);display:grid;place-items:center;padding:18px';
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Connect account');
    dialog.style.cssText = 'box-sizing:border-box;width:min(100%,380px);padding:24px;border-radius:22px;background:white;color:#142044;font:16px system-ui;text-align:center;box-shadow:0 20px 70px #17204044';
    const title = document.createElement('h2');
    title.textContent = signedIn ? 'Google account connected' : 'Connect Google or Slush';
    title.style.cssText = 'font-size:20px;margin:0 0 16px';
    const slot = document.createElement('div');
    slot.style.cssText = 'display:flex;justify-content:center;min-height:44px';
    const slush = document.createElement('button');
    slush.type = 'button';
    slush.textContent = 'Connect with Slush';
    slush.style.cssText = 'display:block;width:250px;max-width:100%;height:44px;margin:12px auto 0;border:1px solid #ddd;border-radius:8px;background:#fff;color:#142044;font:500 15px system-ui;cursor:pointer;-webkit-tap-highlight-color:transparent';
    slush.onclick = () => {
      const host = document.getElementById('walletButton');
      const trigger = host?.shadowRoot?.querySelector('button') || host?.querySelector('button');
      close();
      window.walmoOpeningSlush = true;
      try {
        if (trigger) trigger.click();
        else host?.click();
      } finally { window.walmoOpeningSlush = false; }
    };
    const status = document.createElement('p');
    status.className = 'walmo-google-status';
    status.setAttribute('role', 'status');
    status.style.cssText = 'font-size:13px;color:#56617a;min-height:18px';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:center;gap:14px;margin-top:14px';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'Close';
    cancel.style.cssText = 'border:1px solid #ddd;border-radius:12px;padding:9px 16px;background:white;color:#142044';
    cancel.onclick = close;
    actions.appendChild(cancel);
    if (signedIn) {
      const logout = document.createElement('button');
      logout.type = 'button'; logout.textContent = 'Sign out';
      logout.style.cssText = 'border:0;border-radius:12px;padding:9px 16px;background:#101f4a;color:white';
      logout.onclick = async () => {
        logout.disabled = true;
        try {
          await logout();
        } catch (error) { message(error.message); logout.disabled = false; }
      };
      actions.appendChild(logout);
    }
    dialog.append(title, slot);
    if (!signedIn) dialog.appendChild(slush);
    dialog.append(status, actions);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    return slot;
  }
  function loadGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google sign-in could not load'));
      document.head.appendChild(script);
    });
  }
  async function open() {
    const slot = createDialog();
    if (signedIn) return;
    if (!clientId) { message('Google sign-in is not configured yet.'); return; }
    try {
      await loadGoogle();
      if (!overlay || !slot.isConnected) return;
      window.google.accounts.id.initialize({
        client_id: clientId, ux_mode: 'popup', auto_select: false,
        callback: async response => {
          try {
            message('Verifying your account…');
            await api({ action: 'login', credential: response.credential });
            wipeLocalChats(); location.reload();
          } catch (error) { message(error.message); }
        }
      });
      window.google.accounts.id.renderButton(slot, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: 250 });
    } catch (error) { message(error.message); }
  }
  window.walmoGoogleLogin = open;
  function updateGoogleButton() {
    const roots = [document, ...(window.__walrusShadowRoots || [])];
    for (const root of roots) {
      for (const button of root.querySelectorAll?.('.walmo-google-connect') || []) {
        button.setAttribute('aria-label', signedIn ? 'Google account settings' : 'Continue with Google');
        const label = button.querySelector('.walmo-provider-visual-google span');
        if (label) label.textContent = signedIn ? 'Google account · Sign out' : 'Continue With Google';
      }
    }
  }
  fetch('/api/auth', { credentials: 'same-origin' }).then(r => r.json()).then(data => {
    if (data.success) {
      clientId = data.clientId;
      signedIn = data.signedIn;
      email = data.email || '';
      window.walmoGoogleEmail = email;
      document.body.classList.toggle('walmo-google-signed-in', signedIn);
      window.dispatchEvent(new CustomEvent('walmo:google-session', { detail: { signedIn, email } }));
      updateGoogleButton();
    }
  }).catch(() => {});
})();

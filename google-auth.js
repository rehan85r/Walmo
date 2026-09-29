const WALMO_SLUSH_ICON='data:image/png;base64,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';

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
    slush.style.cssText = 'display:flex;align-items:center;justify-content:flex-start;gap:14px;width:250px;max-width:100%;height:44px;margin:12px auto 0;padding:0 18px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#142044;font:500 15px system-ui;cursor:pointer;-webkit-tap-highlight-color:transparent';
    const slushIcon = document.createElement('img');
    slushIcon.alt = '';
    slushIcon.setAttribute('aria-hidden', 'true');
    slushIcon.src = WALMO_SLUSH_ICON;
    slushIcon.style.cssText = 'display:block;flex:0 0 25px;width:25px;height:25px;object-fit:contain';
    const slushLabel = document.createElement('span');
    slushLabel.textContent = 'Connect with Slush';
    slushLabel.style.cssText = 'display:block;line-height:1;text-align:left';
    slush.append(slushIcon, slushLabel);
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

/* Google sign-in is rendered inside the existing wallet chooser. */
(function () {
  let clientId = '';
  let signedIn = false;
  let googleScriptPromise;
  const mounted = new WeakSet();

  async function api(body) {
    const res = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Authentication failed');
    return data;
  }
  async function logout() {
    if (window.walmoCloudRecentsReady && window.walmoFlushRecents) {
      try { await window.walmoFlushRecents(); }
      catch (error) {
        alert('Chats could not be backed up online. Please check your connection and try again before logging out.');
        return;
      }
    }
    await api({ action: 'logout' });
    window.google?.accounts?.id?.disableAutoSelect?.();
    location.reload();
  }
  window.walmoGoogleLogout = logout;

  function loadGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (googleScriptPromise) return googleScriptPromise;
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google sign-in could not load'));
      document.head.appendChild(script);
    });
    return googleScriptPromise;
  }
  async function mount(wrap) {
    if (!wrap?.isConnected || mounted.has(wrap)) return;
    if (!clientId) return;
    mounted.add(wrap);
    try {
      await loadGoogle();
      if (!wrap.isConnected) return;
      const slot = document.createElement('div');
      slot.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:56px';
      wrap.replaceChildren(slot);
      window.google.accounts.id.initialize({
        client_id: clientId, ux_mode: 'popup', auto_select: false,
        callback: async response => {
          try {
            await api({ action: 'login', credential: response.credential });
            location.reload();
          } catch (error) { alert(error.message); }
        }
      });
      window.google.accounts.id.renderButton(slot, {
        type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
        width: Math.min(320, Math.round(wrap.getBoundingClientRect().width || 250))
      });
    } catch (error) {
      mounted.delete(wrap);
      wrap.textContent = 'Google sign-in unavailable';
      console.error(error);
    }
  }
  fetch('/api/auth', { credentials: 'same-origin' }).then(r => r.json()).then(data => {
    if (!data.success) return;
    clientId = data.clientId;
    signedIn = !!data.signedIn;
    window.walmoGoogleEmail = data.email || '';
    document.body.classList.toggle('walmo-google-signed-in', signedIn);
    window.dispatchEvent(new CustomEvent('walmo:google-session', {
      detail: { signedIn, email: window.walmoGoogleEmail }
    }));
    mount(document.getElementById('walmoGoogleNative'));
  }).catch(error => console.error('Google session unavailable', error));
})();


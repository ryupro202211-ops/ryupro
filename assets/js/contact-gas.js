(() => {
  const localOrigin = origin => {
    try {
      const url = new URL(origin);
      return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch { return false; }
  };
  const isBridgeOrigin = origin => {
    try {
      const url = new URL(origin);
      return (url.protocol === 'https:' && (url.hostname === 'script.googleusercontent.com' || /^[a-z0-9-]+-script\.googleusercontent\.com$/.test(url.hostname)))
        || (localOrigin(location.origin) && origin === location.origin);
    } catch { return false; }
  };
  window.ryuproGasSubmit = (endpoint, payload, timeoutMs) => new Promise((resolve, reject) => {
    const channel = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const url = new URL(endpoint);
    if (!(url.protocol === 'https:' && url.hostname === 'script.google.com' && /^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname))
      && !(localOrigin(location.origin) && url.origin === location.origin)) {
      reject(new Error('Invalid GAS deployment')); return;
    }
    url.searchParams.set('channel', channel);
    url.searchParams.set('parentOrigin', location.origin);
    const frame = document.createElement('iframe');
    frame.title = 'お問い合わせ送信接続';
    frame.hidden = true;
    frame.referrerPolicy = 'no-referrer';
    let bridgeWindow = null;
    let bridgeOrigin = '';
    let submitted = false;
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); frame.remove(); };
    const receive = event => {
      const data = event.data;
      if (!data || !event.source || data.channel !== channel || !isBridgeOrigin(event.origin)) return;
      if (data.kind === 'ryupro-ready' && !bridgeWindow) {
        bridgeWindow = event.source;
        bridgeOrigin = event.origin;
        bridgeWindow.postMessage({ kind: 'ryupro-connect', channel }, bridgeOrigin);
      } else if (event.source === bridgeWindow && event.origin === bridgeOrigin && data.kind === 'ryupro-connected' && !submitted) {
        submitted = true;
        bridgeWindow.postMessage({ kind: 'ryupro-submit', channel, payload }, bridgeOrigin);
      } else if (submitted && event.source === bridgeWindow && event.origin === bridgeOrigin && data.kind === 'ryupro-result' && data.key === payload.idempotencyKey) {
        cleanup(); resolve(data.result);
      }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('GAS response unconfirmed')); }, timeoutMs);
    window.addEventListener('message', receive);
    frame.src = url.href;
    document.body.append(frame);
  });
})();

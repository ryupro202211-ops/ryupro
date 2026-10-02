(() => {
  const form = document.querySelector('#contactForm');
  if (!form) return;
  const type = document.querySelector('#type');
  const source = document.querySelector('#source');
  const subject = document.querySelector('#subject');
  const status = document.querySelector('#formStatus');
  const button = form.querySelector('[type="submit"]');
  const allowedTypes = new Set(['event', 'community', 'career', 'lifestyle', 'work-life', 'partnership', 'other']);
  const allowedSources = new Set(['hero', 'header', 'services', 'contact', 'footer', 'direct']);
  const params = new URLSearchParams(window.location.search);
  const requestedType = params.get('type');
  const requestedSource = params.get('source');
  if (allowedTypes.has(requestedType)) type.value = requestedType;
  if (allowedSources.has(requestedSource)) source.value = requestedSource;
  const labels = Object.fromEntries([...type.options].map(option => [option.value, option.textContent.trim()]));
  const buildSubject = value => `${labels[value].replace(/について$/, "")}についてのお問い合わせ`;
  let generatedSubject = '';
  if (!subject.value && requestedType && allowedTypes.has(requestedType)) {
    generatedSubject = buildSubject(requestedType);
    subject.value = generatedSubject;
    type.addEventListener('change', () => {
      if (!generatedSubject || subject.value !== generatedSubject) return;
      const selectedType = allowedTypes.has(type.value) ? type.value : 'other';
      generatedSubject = buildSubject(selectedType);
      subject.value = generatedSubject;
    });
  }

  const settings = window.ryuproContactSettings || {};
  const endpoint = (() => {
    if (!['api', 'gas'].includes(settings.mode) || !settings.endpoint) return '';
    try {
      const url = new URL(settings.endpoint, window.location.href);
      const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      const hasUrlCredentialsOrFragment = Boolean(url.username || url.password || url.hash);
      return !hasUrlCredentialsOrFragment && (url.protocol === 'https:' || isLocalHttp) ? url.href : '';
    } catch {
      return '';
    }
  })();
  const apiMode = Boolean(endpoint);
  const gasMode = apiMode && settings.mode === 'gas';
  const configuredTimeout = Number(settings.timeoutMs);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(configuredTimeout, 30_000)
    : 10_000;
  let isSubmitting = false;
  let isComplete = false;
  let lastPayloadFingerprint = '';
  let lastIdempotencyKey = '';

  if (apiMode) {
    const labelNode = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (labelNode) labelNode.textContent = 'お問い合わせを送信';
  }
  if (gasMode) {
    document.querySelector('#privacyField').hidden = false;
    form.elements.privacyAccepted.required = true;
    document.querySelector('#mailtoNotice').textContent = 'ご入力の内容をGoogleの仕組みで処理し、合同会社ryuproの担当者へメールで通知します。送信が確認できた後に完了画面を表示します。';
  }
  button.disabled = false;

  form.addEventListener('input', event => {
    if (event.target === subject && subject.value !== generatedSubject) generatedSubject = '';
    event.target.setCustomValidity?.('');
    status.textContent = '';
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (isSubmitting || isComplete) return;

    const name = form.elements.name;
    const email = form.elements.email;
    const message = form.elements.message;
    for (const field of [name, message]) {
      field.setCustomValidity(field.value.trim() ? '' : '空白以外の内容を入力してください。');
    }
    if (!form.reportValidity()) return;

    const chosenType = allowedTypes.has(type.value) ? type.value : 'other';
    const chosenSource = allowedSources.has(source.value) ? source.value : 'direct';
    if (!apiMode) {
      const mailSubject = subject.value.trim() || buildSubject(chosenType);
      const body = [`お名前：${name.value.trim()}`, `メールアドレス：${email.value.trim()}`, `相談内容：${labels[chosenType]}`, `お問い合わせ内容：\n${message.value.trim()}`, `\n受付経路：${chosenSource}`].join('\n');
      const mailto = `mailto:ryupro202211@gmail.com?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(body)}`;
      status.textContent = 'メールアプリを開きます。内容を確認して送信してください。';
      window.location.href = mailto;
      return;
    }

    const acknowledgement = form.elements.namedItem('privacyAccepted');
    if (!acknowledgement || acknowledgement.type !== 'checkbox' || acknowledgement.closest('[hidden]')) {
      status.textContent = '送信前の確認項目が表示されていないため、Webから送信できません。';
      return;
    }
    acknowledgement.setCustomValidity(acknowledgement.checked ? '' : '送信前の確認項目を確認してください。');
    if (!form.reportValidity()) return;

    const payload = {
      type: chosenType,
      name: name.value.trim(),
      email: email.value.trim(),
      subject: subject.value.trim() || buildSubject(chosenType),
      message: message.value.trim(),
      source: chosenSource,
      privacyAccepted: true
    };
    const fingerprint = JSON.stringify(payload);
    if (fingerprint !== lastPayloadFingerprint) {
      if (typeof window.crypto?.randomUUID !== 'function') {
        status.textContent = '安全な送信設定を確認できないため、Webから送信できません。';
        return;
      }
      lastPayloadFingerprint = fingerprint;
      lastIdempotencyKey = window.crypto.randomUUID();
    }
    payload.idempotencyKey = lastIdempotencyKey;
    if (gasMode) payload.website = form.elements.website.value;

    isSubmitting = true;
    button.disabled = true;
    status.textContent = '送信しています。';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      let result;
      if (gasMode) {
        result = await window.ryuproGasSubmit(endpoint, payload, timeoutMs);
      } else {
        const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': lastIdempotencyKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (![200, 201, 202].includes(response.status)) throw new Error('unconfirmed');
        result = await response.json();
      }
      if (!result || result.ok !== true || typeof result.receiptId !== 'string' || !result.receiptId.trim()) {
        throw Object.assign(new Error('unconfirmed'), { code: result?.code });
      }
      status.textContent = 'お問い合わせを受け付けました。';
      isComplete = true;
      button.disabled = true;
      const complete = document.querySelector('#contactComplete');
      if (complete) {
        form.hidden = true;
        document.querySelector('.contact-form-intro').hidden = true;
        complete.hidden = false;
        complete.focus();
      }
    } catch (error) {
      status.textContent = error.code === 'limit'
        ? '現在、受付数の上限に達しています。入力内容は残っています。時間をおいて再試行するか、下記メールアドレスへご連絡ください。'
        : error.code === 'uncertain'
          ? '送信結果を確認できませんでした。重複を避けるため自動で再送しません。入力内容は残っています。下記メールアドレスへご確認ください。'
          : '送信結果を確認できませんでした。入力内容は残っています。同じ内容で再試行できます。';
      button.disabled = false;
    } finally {
      window.clearTimeout(timeout);
      isSubmitting = false;
    }
  });
})();

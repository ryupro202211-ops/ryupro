// Dedicated ryupro contact project. No credentials or unrelated project reuse.
const CONTACT = Object.freeze({
  recipient: 'ryupro202211@gmail.com',
  enabled: false, // Enable only after authorization and live-test approval.
  dailyLimit: 30,
  senderLimit: 3,
  retentionMs: 7 * 24 * 60 * 60 * 1000,
  origins: ['https://ryupro202211-ops.github.io'],
  types: ['event', 'community', 'career', 'lifestyle', 'work-life', 'partnership', 'other'],
  sources: ['hero', 'header', 'services', 'contact', 'footer', 'direct']
});

function doGet(e) {
  const parameters = e && e.parameter || {};
  if (!CONTACT.origins.includes(parameters.parentOrigin) || !/^[a-f0-9]{64}$/.test(parameters.channel || '')) {
    return HtmlService.createHtmlOutput('このページはお問い合わせフォームから開いてください。');
  }
  const template = HtmlService.createTemplateFromFile('Bridge');
  template.parentOrigin = parameters.parentOrigin;
  template.channel = parameters.channel;
  return template.evaluate().setTitle('ryupro お問い合わせ接続')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Running this grants/checks send-mail scope, but sends no email.
// Obtain approval for the exact account and scope before running.
function checkMailAuthorization() {
  return { remainingRecipients: MailApp.getRemainingDailyQuota(), enabled: CONTACT.enabled };
}

function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
}

function validate_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid');
  const limits = { name: 100, email: 254, subject: 120, message: 5000 };
  const data = {};
  Object.keys(limits).forEach(key => {
    if (typeof input[key] !== 'string' || input[key].length > limits[key]) throw new Error('invalid');
    data[key] = input[key].trim();
    if (!data[key] || (key !== 'message' && /[\r\n\u0000-\u001f\u007f]/.test(data[key]))) throw new Error('invalid');
  });
  if (!/^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/.test(data.email)) throw new Error('invalid');
  if (!CONTACT.types.includes(input.type) || !CONTACT.sources.includes(input.source) || input.privacyAccepted !== true) throw new Error('invalid');
  if (input.website !== '' || typeof input.idempotencyKey !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.idempotencyKey)) throw new Error('invalid');
  return Object.assign(data, { type: input.type, source: input.source, privacyAccepted: true });
}

function submitContact(input) {
  let data;
  try { data = validate_(input); } catch (_) { return { ok: false, code: 'invalid' }; }
  if (!CONTACT.enabled) return { ok: false, code: 'unavailable' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: false, code: 'busy' };
  try {
    const store = PropertiesService.getScriptProperties();
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const key = 'contact:' + input.idempotencyKey.toLowerCase();
    const fingerprint = digest_(JSON.stringify(data));
    const stored = store.getProperty(key);
    if (stored) {
      const previous = JSON.parse(stored);
      if (previous.fingerprint !== fingerprint) return { ok: false, code: 'conflict' };
      return previous.state === 'sent'
        ? { ok: true, receiptId: previous.receiptId }
        : { ok: false, code: 'uncertain' };
    }
    // Store only hashes, counters and receipt state, never the inquiry text.
    const entries = store.getProperties();
    Object.keys(entries).forEach(item => {
      if (!item.startsWith('contact:')) return;
      const record = JSON.parse(entries[item]);
      if (now - record.createdAt > CONTACT.retentionMs) store.deleteProperty(item);
    });
    const counterKey = 'limits';
    let limits = JSON.parse(store.getProperty(counterKey) || '{}');
    if (limits.day !== day) limits = { day, total: 0, senders: {} };
    const senderHash = digest_(data.email.toLowerCase());
    if (limits.total >= CONTACT.dailyLimit || (limits.senders[senderHash] || 0) >= CONTACT.senderLimit || MailApp.getRemainingDailyQuota() < 1) {
      return { ok: false, code: 'limit' };
    }
    const record = { fingerprint, receiptId: Utilities.getUuid(), state: 'pending', createdAt: now };
    // Record intent before MailApp: an interrupted/ambiguous send is never resent automatically.
    limits.total += 1;
    limits.senders[senderHash] = (limits.senders[senderHash] || 0) + 1;
    store.setProperty(counterKey, JSON.stringify(limits));
    store.setProperty(key, JSON.stringify(record));
    try {
      MailApp.sendEmail({
        to: CONTACT.recipient,
        subject: '[ryupro お問い合わせ] ' + data.subject,
        body: ['受付番号: ' + record.receiptId, 'お名前: ' + data.name, 'メール: ' + data.email,
          '相談種別: ' + data.type, '受付経路: ' + data.source, '', data.message].join('\n'),
        replyTo: data.email,
        name: 'ryupro お問い合わせ'
      });
      record.state = 'sent';
      store.setProperty(key, JSON.stringify(record));
      return { ok: true, receiptId: record.receiptId };
    } catch (_) {
      // MailApp may have sent before throwing, so retain the pending intent.
      return { ok: false, code: 'uncertain' };
    }
  } catch (_) {
    return { ok: false, code: 'unavailable' };
  } finally {
    lock.releaseLock();
  }
}

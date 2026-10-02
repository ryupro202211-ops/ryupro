const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');

function backend({ enabled = true, quota = 100, throwMail = false, failFinalWrite = false, locked = false } = {}) {
  const values = {};
  const messages = [];
  let released = 0;
  const properties = {
    getProperty: key => values[key] ?? null,
    getProperties: () => ({ ...values }),
    deleteProperty: key => { delete values[key]; },
    setProperty(key, value) {
      if (failFinalWrite && key.startsWith('contact:') && JSON.parse(value).state === 'sent') throw new Error('write failed');
      values[key] = value;
    }
  };
  const context = vm.createContext({
    Date, Object, JSON,
    MailApp: {
      getRemainingDailyQuota: () => quota,
      sendEmail: message => { messages.push(message); if (throwMail) throw new Error('uncertain mail outcome'); }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_, text) => [...crypto.createHash('sha256').update(text).digest()],
      getUuid: () => crypto.randomUUID()
    },
    PropertiesService: { getScriptProperties: () => properties },
    LockService: { getScriptLock: () => ({ tryLock: () => !locked, releaseLock: () => { released += 1; } }) }
  });
  let source = fs.readFileSync('tools/contact-gas/Code.gs', 'utf8');
  if (enabled) source = source.replace('enabled: false', 'enabled: true');
  vm.runInContext(source, context);
  return { submit: input => context.submitContact(input), values, messages, released: () => released };
}
const input = () => ({ name: 'テスト利用者', email: 'test@example.com', subject: 'ローカルテスト', message: 'モック検証のみ',
  type: 'career', source: 'services', privacyAccepted: true, website: '', idempotencyKey: crypto.randomUUID() });

test('GAS stays disabled by default without sending or persisting personal data', () => {
  const server = backend({ enabled: false });
  assert.equal(server.submit(input()).code, 'unavailable');
  assert.equal(server.messages.length, 0);
  assert.deepEqual(server.values, {});
});
test('GAS sends only to fixed operator, preserves reply-to, and deduplicates receipts', () => {
  const server = backend(); const data = input();
  const result = server.submit(data);
  assert.equal(result.ok, true);
  assert.equal(server.submit(data).receiptId, result.receiptId);
  assert.equal(server.messages.length, 1);
  assert.equal(server.messages[0].to, 'ryupro202211@gmail.com');
  assert.equal(server.messages[0].replyTo, 'test@example.com');
  assert.match(server.messages[0].body, /モック検証のみ/);
  const persisted = JSON.stringify(server.values);
  for (const personal of [data.email, data.name, data.subject, data.message]) assert.ok(!persisted.includes(personal));
  assert.equal(server.released(), 2);
});
test('GAS refuses invalid fields, header injection, honeypot and missing consent', () => {
  const server = backend();
  for (const patch of [{name:' '}, {email:'invalid'}, {email:'a@example.com\nBcc: other@example.com'}, {subject:'x\ny'},
    {message:'x'.repeat(5001)}, {privacyAccepted:false}, {type:'unknown'}, {source:'unknown'}, {website:'spam'},
    {idempotencyKey:'bad'}]) assert.equal(server.submit({ ...input(), ...patch }).code, 'invalid');
  assert.equal(server.messages.length, 0);
});
test('GAS rejects reusing a key with changed content', () => {
  const server = backend(); const data = input(); server.submit(data);
  assert.equal(server.submit({ ...data, message:'changed' }).code, 'conflict');
  assert.equal(server.messages.length, 1);
});
test('GAS enforces per-sender/global caps and live MailApp quota', () => {
  const sender = backend();
  for (let n=0;n<3;n++) assert.equal(sender.submit(input()).ok, true);
  assert.equal(sender.submit(input()).code, 'limit');
  const global = backend();
  for (let n=0;n<30;n++) assert.equal(global.submit({ ...input(), email:`test${n}@example.com` }).ok, true);
  assert.equal(global.submit({ ...input(), email:'next@example.com' }).code, 'limit');
  const noQuota = backend({quota:0}); assert.equal(noQuota.submit(input()).code, 'limit');
  assert.equal(noQuota.messages.length, 0);
});
test('ambiguous mail/final-write failures retain intent and never resend', () => {
  for (const options of [{throwMail:true}, {failFinalWrite:true}]) {
    const server = backend(options); const data=input();
    assert.equal(server.submit(data).code, 'uncertain');
    assert.equal(server.submit(data).code, 'uncertain');
    assert.equal(server.messages.length, 1);
  }
});
test('busy lock and retryable quota failure do not consume an idempotency key', () => {
  const server=backend({locked:true}); assert.equal(server.submit(input()).code, 'busy');
  assert.deepEqual(server.values, {});
  const quota=backend({quota:0}); const data=input(); quota.submit(data);
  assert.equal(quota.values['contact:'+data.idempotencyKey], undefined);
});
test('expired ledger records are removed, and current accepted records stay', () => {
  const server=backend(); const data=input(); server.submit(data);
  const key='contact:'+data.idempotencyKey;
  server.values['contact:old']=JSON.stringify({createdAt:0,state:'sent'});
  server.submit({...input(),email:'second@example.com'});
  assert.equal(server.values['contact:old'], undefined);
  assert.ok(server.values[key]);
});

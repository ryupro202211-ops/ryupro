const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const labels = [
  ['other', 'まだ決まっていない・その他'],
  ['event', 'イベントの参加・企画'],
  ['community', 'コミュニティについて'],
  ['career', 'キャリアについて'],
  ['lifestyle', '住まい・健康・美容について'],
  ['work-life', '仕事・暮らしについて'],
  ['partnership', '協業について']
].map(([value, textContent]) => ({ value, textContent }));

function loadContactPage(search) {
  const formListeners = {};
  const typeListeners = {};
  const fields = {
    name: { value: '', setCustomValidity() {} },
    email: { value: '', setCustomValidity() {} },
    message: { value: '', setCustomValidity() {} }
  };
  const type = {
    value: 'other',
    options: labels,
    addEventListener(name, listener) { typeListeners[name] = listener; }
  };
  const subject = { value: '' };
  const status = { textContent: '' };
  const button = { disabled: true };
  const form = {
    elements: fields,
    querySelector: () => button,
    addEventListener(name, listener) { formListeners[name] = listener; },
    reportValidity: () => true
  };
  const document = {
    querySelector(selector) {
      return {
        '#contactForm': form,
        '#type': type,
        '#source': { value: 'direct' },
        '#subject': subject,
        '#formStatus': status
      }[selector] || null;
    }
  };
  const window = { location: { search } };
  const script = fs.readFileSync(path.join(__dirname, '..', 'assets/js/contact.js'), 'utf8');
  vm.runInNewContext(script, { document, window, URLSearchParams, Set, Object, encodeURIComponent });
  return {
    type,
    subject,
    changeType(value) {
      type.value = value;
      typeListeners.change?.({ target: type });
    }
  };
}

test('updates the generated subject when the selected inquiry type changes', () => {
  const page = loadContactPage('?type=career&source=services');
  assert.equal(page.subject.value, 'キャリアについてのお問い合わせ');
  page.changeType('community');
  assert.equal(page.subject.value, 'コミュニティについてのお問い合わせ');
});

test('preserves a subject the visitor edited when the inquiry type changes', () => {
  const page = loadContactPage('?type=career&source=services');
  page.subject.value = '相談の日程について';
  page.changeType('community');
  assert.equal(page.subject.value, '相談の日程について');
});

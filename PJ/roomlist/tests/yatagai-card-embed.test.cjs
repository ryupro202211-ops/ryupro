const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const html = readFileSync(resolve(__dirname, '../矢田貝様_物件一覧.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({});
vm.runInContext(script.slice(0, script.indexOf('document.title')) +
  script.slice(script.indexOf('const strip ='), script.indexOf('// ---------- フィルタ')), context);

test('each card displays its own PDF image outside collapsed details and links to the source PDF', () => {
  const cards = vm.runInContext('PROPERTIES.map(p => ({ id: p.id, driveId: p.driveId, html: cardHtml(p) }))', context);
  assert.equal(cards.length, 11);
  for (const card of cards) {
    const outsideDetails = card.html.replace(/<details\b[\s\S]*?<\/details>/g, '');
    const image = outsideDetails.match(/<img\b[^>]*>/);
    assert.ok(image, 'PDF image must be visible without opening details');
    assert.ok(image[0].includes('yatagai-floorplans/' + card.id + '.jpg'));
    assert.ok(existsSync(resolve(__dirname, '../yatagai-floorplans/' + card.id + '.jpg')));
    assert.match(image[0], /loading="lazy"/);
    assert.match(image[0], /alt="[^"]+"/);
    assert.ok(card.html.includes('https://drive.google.com/file/d/' + card.driveId + '/view'));
    assert.doesNotMatch(card.html, /<button[^>]*>図面を見る<\/button>/);
  }
});

test('cards without a PDF retain contact guidance instead of a broken embed', () => {
  const card = vm.runInContext('cardHtml({ ...PROPERTIES[0], driveId: "" })', context);
  assert.doesNotMatch(card, /<iframe|<img/);
  assert.match(card, /お問い合わせください/);
});

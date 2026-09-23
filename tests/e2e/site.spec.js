const { test, expect } = require('@playwright/test');
const http = require('node:http');

const viewports = [320, 390, 640, 768, 1440];
const pages = [
  ['top page', ''],
  ['contact page', 'contact/']
];
const apiEndpoint = 'https://contact.test/api';

async function openApiContact(page, { timeoutMs = 10_000, acknowledgement = true, accepted = true, endpoint = apiEndpoint } = {}) {
  await page.addInitScript(settings => {
    window.ryuproContactSettings = settings;
  }, { mode: 'api', endpoint, timeoutMs });
  await page.goto('contact/?type=career&source=services', { waitUntil: 'domcontentloaded' });
  if (acknowledgement) {
    await page.locator('#contactForm').evaluate(form => {
      const label = document.createElement('label');
      label.htmlFor = 'privacyAccepted';
      label.textContent = 'テスト用の確認項目';
      const checkbox = document.createElement('input');
      checkbox.id = 'privacyAccepted';
      checkbox.name = 'privacyAccepted';
      checkbox.type = 'checkbox';
      checkbox.required = true;
      form.append(label, checkbox);
    });
    if (accepted) await page.locator('#privacyAccepted').check();
  }
  await page.locator('#name').fill('テスト利用者');
  await page.locator('#email').fill('test@example.com');
  await page.locator('#message').fill('接続確認用の内容');
  return page.getByRole('button', { name: 'お問い合わせを送信' });
}

async function mockContactApi(page, handlePost) {
  let postCount = 0;
  let preflightCount = 0;
  const requests = [];
  const failures = [];
  page.on('request', request => {
    if (request.url() === apiEndpoint) requests.push(`${request.method()} started`);
  });
  page.on('requestfailed', request => {
    if (request.url() === apiEndpoint) failures.push(`${request.method()}: ${request.failure()?.errorText}`);
  });
  await page.route(apiEndpoint, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      preflightCount += 1;
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': request.headers().origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, idempotency-key'
        }
      });
    }
    postCount += 1;
    await handlePost(route);
  });
  const getPostCount = () => postCount;
  getPostCount.diagnostics = () => ({ preflightCount, requests, failures });
  return getPostCount;
}

async function startCorsDeniedServer() {
  const methods = [];
  const server = http.createServer((request, response) => {
    methods.push(request.method);
    response.writeHead(204);
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    endpoint: `http://127.0.0.1:${address.port}/api`,
    methods,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

async function startRedirectingApiServer() {
  let redirectedRequests = 0;
  const server = http.createServer((request, response) => {
    const origin = request.headers.origin || '';
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, idempotency-key'
      });
      response.end();
      return;
    }
    if (request.url === '/api') {
      request.resume();
      response.writeHead(307, {
        'access-control-allow-origin': origin,
        location: '/redirected'
      });
      response.end();
      return;
    }
    redirectedRequests += 1;
    response.writeHead(202, {
      'access-control-allow-origin': origin,
      'content-type': 'application/json'
    });
    response.end(JSON.stringify({ ok: true, receiptId: 'redirected-test-receipt' }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    endpoint: `http://127.0.0.1:${address.port}/api`,
    redirectedRequests: () => redirectedRequests,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

async function respondWithJson(route, status, payload) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': route.request().headers().origin,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

for (const [name, route] of pages) {
  for (const width of viewports) {
    test(`${name} has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
}

test('shows contact in the primary navigation and keeps the final CTA', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const contactLinks = page.locator('a[href^="/ryupro/contact/"]');
  await expect(contactLinks).toHaveCount(2);
  await expect(page.locator('#primaryNav a[href="#journal"]')).toHaveText('ブログ');
  await expect(page.locator('#primaryNav a.nav-contact')).toHaveText(/コンタクト/);
  await expect(page.locator('.contact-section a[href^="/ryupro/contact/"]')).toHaveText(/相談内容を送る/);
});

test('keeps navigation, the hero and the contact fallback usable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /人生が動く瞬間を/ })).toBeVisible();
  await expect(page.locator('.nav-links a').first()).toBeVisible();
  await expect(page.locator('.nav-toggle')).toBeHidden();
  expect(await page.locator('.journal-card').count()).toBeLessThanOrEqual(3);

  await page.goto('contact/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.noscript-contact')).toBeVisible();
  await expect(page.locator('.noscript-contact a[href^="mailto:"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /メールアプリを開く/ })).toBeDisabled();
  await context.close();
});

test('opens and closes the mobile menu with keyboard and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const menu = page.getByRole('button', { name: 'メニュー' });

  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#primaryNav')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '事業内容を見る' })).toBeFocused();

  await menu.click();
  await page.getByRole('link', { name: '活動紹介' }).click();
  await expect(page).toHaveURL(/#projects$/);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('supports the founder story disclosure from the keyboard', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const details = page.locator('details').first();
  const summary = details.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
});

test('honors reduced-motion preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const duration = await page.locator('.button').first().evaluate(element => getComputedStyle(element).transitionDuration);
  const milliseconds = duration.split(',').map(value => {
    const trimmed = value.trim();
    return trimmed.endsWith('ms') ? parseFloat(trimmed) : parseFloat(trimmed) * 1000;
  });
  expect(Math.max(...milliseconds)).toBeLessThanOrEqual(0.01);
});

test('ignores unapproved contact query values without creating markup', async ({ page }) => {
  const hostileType = encodeURIComponent('<script>window.__queryAttack=1</script>');
  const unknownSource = encodeURIComponent('<img src=x onerror=window.__queryAttack=1>');
  await page.goto(`contact/?type=${hostileType}&source=${unknownSource}`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#type')).toHaveValue('other');
  await expect(page.locator('#source')).toHaveValue('direct');
  expect(await page.evaluate(() => window.__queryAttack)).toBeUndefined();
  expect(await page.locator('img[onerror], script:not([src])').count()).toBe(0);
});

test('validates blank and whitespace-only form fields without opening a mail app', async ({ page }) => {
  await page.goto('contact/?type=career&source=services', { waitUntil: 'domcontentloaded' });
  await page.locator('#name').fill('   ');
  await page.locator('#email').fill('test@example.com');
  await page.locator('#message').fill('   ');
  await page.getByRole('button', { name: /メールアプリを開く/ }).click();

  await expect(page).toHaveURL(/\/contact\/\?type=career&source=services$/);
  expect(await page.locator('#name').evaluate(element => element.validity.valid)).toBe(false);
  expect(await page.locator('#message').evaluate(element => element.validity.valid)).toBe(false);
});

test('enforces maximum field lengths while typing', async ({ page }) => {
  await page.goto('contact/', { waitUntil: 'domcontentloaded' });
  const fields = [
    ['#name', 100],
    ['#email', 254],
    ['#subject', 120],
    ['#message', 5000]
  ];

  for (const [selector, limit] of fields) {
    const field = page.locator(selector);
    await field.pressSequentially('x'.repeat(limit + 1), { delay: 0 });
    expect(await field.inputValue()).toHaveLength(limit);
  }
});

test('accepts API submissions only after a valid acknowledgement and receipt', async ({ page }) => {
  let submittedPayload;
  let submittedKey;
  await mockContactApi(page, async route => {
    submittedPayload = JSON.parse(route.request().postData());
    submittedKey = route.request().headers()['idempotency-key'];
    await respondWithJson(route, 202, { ok: true, receiptId: 'private-test-receipt' });
  });
  const submit = await openApiContact(page);
  await expect(submit).toBeVisible();
  await submit.click();

  await expect(page.locator('#formStatus')).toContainText('受け付けました');
  expect(submittedPayload).toEqual({
    type: 'career',
    name: 'テスト利用者',
    email: 'test@example.com',
    message: '接続確認用の内容',
    source: 'services',
    privacyAccepted: true,
    idempotencyKey: submittedKey
  });
  expect(submittedKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(await page.locator('#formStatus').textContent()).not.toContain('private-test-receipt');
});

const rejectedApiResponses = [
  ['HTTP 429', route => respondWithJson(route, 429, { ok: false })],
  ['HTTP 5xx', route => respondWithJson(route, 503, { ok: false })],
  ['malformed JSON', route => route.fulfill({ status: 202, headers: { 'access-control-allow-origin': route.request().headers().origin, 'content-type': 'application/json' }, body: '{' })],
  ['2xx response without a receipt', route => respondWithJson(route, 200, { ok: true })],
  ['empty 2xx response', route => route.fulfill({ status: 202, headers: { 'access-control-allow-origin': route.request().headers().origin }, body: '' })],
  ['network failure', route => route.abort('failed')]
];

for (const [failure, handlePost] of rejectedApiResponses) {
  test(`does not report API success for ${failure}`, async ({ page }) => {
    const postCount = await mockContactApi(page, handlePost);
    const submit = await openApiContact(page);
    await expect(submit).toBeVisible();
    await submit.click();

    await expect(page.locator('#formStatus')).toContainText('確認できませんでした');
    await expect(page.locator('#formStatus')).not.toContainText('受け付けました');
    expect(postCount(), `API diagnostics: ${JSON.stringify(postCount.diagnostics())}`).toBe(1);
    await expect(page.locator('#name')).toHaveValue('テスト利用者');
  });
}

test('treats a blocked CORS preflight as an unconfirmed API result', async ({ page }) => {
  const corsServer = await startCorsDeniedServer();
  try {
    const submit = await openApiContact(page, { endpoint: corsServer.endpoint });
    await expect(submit).toBeVisible();
    await submit.click();

    await expect(page.locator('#formStatus')).toContainText('確認できませんでした');
    expect(corsServer.methods).toEqual(['OPTIONS']);
  } finally {
    await corsServer.close();
  }
});

test('does not follow API redirects with contact data', async ({ page }) => {
  const redirectServer = await startRedirectingApiServer();
  try {
    const submit = await openApiContact(page, { endpoint: redirectServer.endpoint });
    await expect(submit).toBeVisible();
    await submit.click();

    await expect(page.locator('#formStatus')).toContainText('確認できませんでした');
    expect(redirectServer.redirectedRequests()).toBe(0);
  } finally {
    await redirectServer.close();
  }
});

test('treats an API timeout as unconfirmed and preserves the form', async ({ page }) => {
  await mockContactApi(page, async route => {
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      await respondWithJson(route, 202, { ok: true, receiptId: 'late-test-receipt' });
    } catch {}
  });
  const submit = await openApiContact(page, { timeoutMs: 25 });
  await expect(submit).toBeVisible();
  await submit.click();

  await expect(page.locator('#formStatus')).toContainText('確認できませんでした');
  await expect(page.locator('#message')).toHaveValue('接続確認用の内容');
  await expect(page.locator('#formStatus')).not.toContainText('late-test-receipt');
});

test('does not send through API without a visible acknowledgement control', async ({ page }) => {
  const postCount = await mockContactApi(page, async route => {
    await respondWithJson(route, 202, { ok: true, receiptId: 'must-not-be-sent' });
  });
  const submit = await openApiContact(page, { acknowledgement: false });
  await expect(submit).toBeVisible();
  await submit.click();

  await expect(page.locator('#formStatus')).toContainText('確認項目');
  expect(postCount()).toBe(0);
});

test('requires acknowledgement before an API request', async ({ page }) => {
  const postCount = await mockContactApi(page, async route => {
    await respondWithJson(route, 202, { ok: true, receiptId: 'must-not-be-sent' });
  });
  const submit = await openApiContact(page, { accepted: false });
  await expect(submit).toBeVisible();
  await submit.click();

  expect(postCount()).toBe(0);
  await expect(page.locator('#privacyAccepted')).not.toBeChecked();
});

test('prevents duplicate API submissions and reuses the key on retry', async ({ page }) => {
  const keys = [];
  const postCount = await mockContactApi(page, async route => {
    keys.push(route.request().headers()['idempotency-key']);
    await new Promise(resolve => setTimeout(resolve, 50));
    if (keys.length === 1) await respondWithJson(route, 503, { ok: false });
    else await respondWithJson(route, 202, { ok: true, receiptId: 'private-test-receipt' });
  });
  const submit = await openApiContact(page);
  await expect(submit).toBeVisible();
  await page.locator('#contactForm').evaluate(form => {
    form.requestSubmit();
    form.requestSubmit();
  });

  await expect(page.locator('#formStatus')).toContainText('確認できませんでした');
  expect(postCount()).toBe(1);
  await submit.click();
  await expect(page.locator('#formStatus')).toContainText('受け付けました');
  expect(postCount()).toBe(2);
  expect(keys[1]).toBe(keys[0]);
  await expect(page.locator('#name')).toHaveValue('テスト利用者');
  await expect(page.locator('#message')).toHaveValue('接続確認用の内容');
});

test('loads every local homepage image without page errors', async ({ page }) => {
  const pageErrors = [];
  const localFailures = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith('http://127.0.0.1:')) localFailures.push(request.url());
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const serviceEventsImage = page.locator('.service-item .service-image img').first();
  await expect(serviceEventsImage).toHaveAttribute('src', /\/service-events\.png$/);
  await expect(serviceEventsImage).toHaveAttribute('alt', 'BBQを囲んで会話を楽しむ20代の男女');
  const images = page.locator('img');
  for (let index = 0; index < await images.count(); index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  expect(pageErrors).toEqual([]);
  expect(localFailures).toEqual([]);
});

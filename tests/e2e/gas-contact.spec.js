const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const bridgeTemplate = fs.readFileSync('tools/contact-gas/Bridge.html', 'utf8');

async function openGas(page, { result = { ok: true, receiptId: 'mock-only-receipt' }, timeoutMs = 2000, noReply = false } = {}) {
  let calls = 0;
  let submitted;
  await page.exposeFunction('mockGasContact', payload => { calls++; submitted = payload; return result; });
  await page.addInitScript(({timeoutMs}) => {
    window.ryuproContactSettings = {mode:'gas', endpoint:location.origin+'/gas-wrapper',timeoutMs};
  }, {timeoutMs});
  await page.route('**/gas-wrapper?*', route => {
    const url = new URL(route.request().url());
    const child = '/gas-child?' + url.searchParams.toString();
    return route.fulfill({contentType:'text/html',body:`<iframe src="${child.replaceAll('&','&amp;')}"></iframe>`});
  });
  await page.route('**/gas-child?*', route => {
    const url=new URL(route.request().url());
    const script = `<script>window.google={script:{run:{withSuccessHandler(fn){this.success=fn;return this},withFailureHandler(fn){this.failure=fn;return this},submitContact(payload){${noReply?'return;':'window.top.mockGasContact(payload).then(this.success,this.failure);'}}}}};</script>`;
    const body=bridgeTemplate.replace('<?= channel ?>',url.searchParams.get('channel'))
      .replace('<?= parentOrigin ?>',url.searchParams.get('parentOrigin')).replace('<script>',script+'<script>');
    return route.fulfill({contentType:'text/html',body});
  });
  await page.goto('contact/?type=career&source=services');
  await page.locator('#name').fill('モック利用者');
  await page.locator('#email').fill('test@example.com');
  await page.locator('#message').fill('外部には送らないローカル検証');
  return { count:()=>calls, payload:()=>submitted, submit:page.getByRole('button',{name:'お問い合わせを送信'}) };
}

test('GAS nested bridge submits only with consent, uses subject, and shows completion', async ({page}) => {
  const gas=await openGas(page);
  await expect(page.locator('#mailtoNotice')).toContainText('Google');
  await gas.submit.click(); expect(gas.count()).toBe(0);
  await page.locator('#privacyAccepted').check();
  await gas.submit.click();
  await expect(page.locator('#contactComplete')).toBeVisible();
  expect(gas.count()).toBe(1);
  expect(gas.payload()).toMatchObject({subject:'キャリアについてのお問い合わせ',website:'',privacyAccepted:true});
  await expect(page.locator('#contactComplete')).toBeFocused();
});

for (const width of [320,390,1440]) {
  test(`GAS consent form fits at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    const gas=await openGas(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#privacyField').scrollIntoViewIfNeeded();
    const box=await page.locator('#privacyAccepted').boundingBox();
    expect(box.width).toBe(20);expect(box.height).toBe(20);
    await page.screenshot({path:`test-results/contact-gas-${width}.png`});
    await page.locator('#privacyAccepted').check();await gas.submit.click();
    await expect(page.locator('#contactComplete')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/contact-complete-${width}.png`});
  });
}

for (const code of ['limit','uncertain','unavailable','invalid','busy']) {
  test(`GAS ${code} result preserves fields and never shows success`,async({page})=>{
    const gas=await openGas(page,{result:{ok:false,code}});
    await page.locator('#privacyAccepted').check(); await gas.submit.click();
    await expect(page.locator('#formStatus')).not.toBeEmpty();
    await expect(page.locator('#contactComplete')).toBeHidden();
    await expect(page.locator('#message')).toHaveValue('外部には送らないローカル検証');
    await expect(gas.submit).toBeEnabled();
    expect(gas.count()).toBe(1);
  });
}

test('GAS timeout and double click preserve the key for retry',async({page})=>{
  const gas=await openGas(page,{noReply:true,timeoutMs:300});
  await page.locator('#privacyAccepted').check();
  const keys=[];
  await page.evaluate(()=>{
    const submit=window.ryuproGasSubmit;
    window.gasKeys=[];
    window.ryuproGasSubmit=(endpoint,payload,timeout)=>{window.gasKeys.push(payload.idempotencyKey);return submit(endpoint,payload,timeout)};
  });
  await page.locator('#contactForm').evaluate(form=>{form.requestSubmit();form.requestSubmit()});
  await expect(page.locator('#formStatus')).toContainText('確認できませんでした');
  await gas.submit.click(); await expect(page.locator('#formStatus')).toContainText('確認できませんでした');
  keys.push(...await page.evaluate(()=>window.gasKeys));
  expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
  expect(gas.count()).toBe(0);
});

test('forged channel/origin/result messages cannot complete or disclose inquiry data',async({page})=>{
  const gas=await openGas(page,{noReply:true,timeoutMs:300});
  await page.locator('#privacyAccepted').check();await gas.submit.click();
  await page.evaluate(()=>{
    const channel=new URL(document.querySelector('iframe').src).searchParams.get('channel');
    window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.example',source:window,data:{channel,kind:'ryupro-ready'}}));
    window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{channel:'wrong',kind:'ryupro-ready'}}));
    window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{channel,kind:'ryupro-result',result:{ok:true,receiptId:'forged'}}}));
  });
  await expect(page.locator('#formStatus')).toContainText('確認できませんでした');
  await expect(page.locator('#contactComplete')).toBeHidden();expect(gas.count()).toBe(0);
});

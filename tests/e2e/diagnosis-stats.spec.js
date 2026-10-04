const {test,expect}=require('@playwright/test');

test.use({reducedMotion:'reduce'});
async function statsMock(page,plans){
  let gets=0,posts=0;
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==='POST'){posts++;return route.abort();}
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname==='script.google.com'){
      const plan=plans[gets++];
      if(!plan||plan.error)return route.abort();
      const cb=url.searchParams.get('callback');
      const body=plan.empty?'':`setTimeout(()=>{if(window[${JSON.stringify(cb)}])window[${JSON.stringify(cb)}](${JSON.stringify(plan.data)});},${plan.delay||0});`;
      return route.fulfill({contentType:'text/javascript',body});
    }
    return route.abort();
  });
  return {gets:()=>gets,posts:()=>posts};
}
const data={total:10,counts:{'先駆けパイオニア型':3}};

for(const path of ['shindan','shindan_result'])for(const width of [390,1440]){
 test(`${path} ${width}: keyboard retry sends only one GET and preserves result`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const mock=await statsMock(page,[{error:true},{data,delay:100},{error:true},{data}]);
  await page.goto(`${path}/?a=00001`);
  const button=page.getByRole('button',{name:'出現率を再取得'});
  await expect(button).toBeVisible();
  await page.locator('#resultStats').screenshot({path:test.info().outputPath('retry.png')});
  const details=await page.locator('.result-details').innerHTML();
  await button.focus();await page.keyboard.press('Enter');
  await page.evaluate(()=>{retryStats();retryStats();});
  await expect(page.locator('#resultStats')).toContainText('集計10件中3件');
  expect(mock.gets()).toBe(2);expect(mock.posts()).toBe(0);
  expect(await page.locator('.result-details').innerHTML()).toBe(details);
  await page.evaluate(()=>{sendToSheet=()=>{window.testRecords=(window.testRecords||0)+1;};resetState();state.answers=[0,0,0,0,1];renderExtra();submitExtra(true);});
  await expect(button).toBeVisible();
  expect(await page.evaluate(()=>window.testRecords)).toBe(1);
  await button.focus();await page.keyboard.press('Space');
  await expect(page.locator('#resultStats')).toContainText('集計10件中3件');
  expect(mock.gets()).toBe(4);expect(mock.posts()).toBe(0);
  expect(await page.evaluate(()=>window.testRecords)).toBe(1);
  await page.evaluate(()=>renderResult(false));
  expect(mock.gets()).toBe(4);expect(await page.evaluate(()=>window.testRecords)).toBe(1);
  expect(await page.locator('.type-context').innerText()).toContain('5問だけ');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('late normal JSONP at 14 seconds succeeds; timeout, invalid data and retry failure remain recoverable',async({page})=>{
 await page.clock.install();
 const mock=await statsMock(page,[{data,delay:14000},{empty:true},{data:{total:'10',counts:{}}},{error:true},{data}]);
 await page.goto('shindan_result/?a=00001');
 await expect(page.locator('#resultStats')).toContainText('読み込み中');
 await page.clock.runFor(14000);
 await expect(page.locator('#resultStats')).toContainText('集計10件中3件');
 await page.evaluate(()=>refreshStats());
 await expect(page.locator('#resultStats')).toContainText('読み込み中');
 await page.clock.runFor(15000);
 const retry=page.getByRole('button',{name:'出現率を再取得'});
 await expect(retry).toBeVisible();
 await retry.click();await page.clock.runFor(1);await expect(retry).toBeVisible();
 await retry.click();await expect(retry).toBeVisible();
 await retry.click();await page.clock.runFor(1);
 await expect(page.locator('#resultStats')).toContainText('集計10件中3件');
 expect(mock.gets()).toBe(5);expect(mock.posts()).toBe(0);
});

test('screen reset cancels old request and rerender keeps current request',async({page})=>{
 await page.clock.install();
 const mock=await statsMock(page,[{data,delay:14000},{data:{total:20,counts:{'先駆けパイオニア型':2}}}]);
 await page.goto('shindan_result/?a=11111');
 const old=await page.evaluate(()=>{const script=[...document.scripts].find(s=>s.id.startsWith('__stats_'));window.oldStatsCallback=window[script.id];return script.id;});
 await page.evaluate(()=>{resetState();state.answers=[0,0,0,0,1];renderResult(true);refreshStats();renderResult(true);});
 await page.clock.runFor(1);
 await expect(page.locator('#resultStats')).toContainText('集計20件中2件');
 await page.evaluate(()=>window.oldStatsCallback({total:100,counts:{'先駆けパイオニア型':99}}));
 await page.clock.runFor(15000);
 await expect(page.locator('#resultStats')).toContainText('集計20件中2件');
 expect(await page.evaluate(cb=>window[cb]===undefined,old)).toBe(true);
 await page.evaluate(()=>{refreshStats();restart();});
 await page.clock.runFor(15000);
 expect(await page.evaluate(()=>currentScreen)).toBe('intro');
 expect(mock.posts()).toBe(0);
});

test('pagehide cancels JSONP and restores an actionable retry when returning',async({page})=>{
 await page.clock.install();
 await statsMock(page,[{data,delay:14000},{data}]);
 await page.goto('shindan_result/?a=11111');
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 await page.clock.runFor(15000);
 const retry=page.getByRole('button',{name:'出現率を再取得'});
 await expect(retry).toBeVisible();
 expect(await page.locator('.type-context').count()).toBe(0);
 await retry.click();await page.clock.runFor(1);
 await expect(page.locator('#resultStats')).toContainText('集計10件中3件');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(file = 'shindan') {
  const html = fs.readFileSync(path.join(__dirname, '..', file, 'index.html'), 'utf8');
  const code = html.slice(html.indexOf('let STATS ='), html.indexOf('// 出現率からSSR'));
  let now = 0, id = 0;
  const timers = new Map(), scripts = [], region = { innerHTML: '' };
  const context = vm.createContext({
    window: {}, SHEET_ENDPOINT: 'https://stats.test/exec', currentScreen: 'result',
    state: {type:'TEST'}, TYPES: {TEST:{name:'Test type'}},
    document: {createElement:()=>({remove(){this.removed=true;}}),head:{appendChild(s){scripts.push(s);}},getElementById:()=>region},
    setTimeout(fn, ms){const key=++id;timers.set(key,{fn,at:now+ms});return key;},clearTimeout(key){timers.delete(key);},
    getRarityTier:()=> 'N', buildRarityHTML:(_tier,pct,detail)=>`rate ${pct}% ${detail}`
  });
  vm.runInContext(code, context);
  return {context,scripts,region,run:s=>vm.runInContext(s,context),advance(ms){now+=ms;for(const [key,t] of [...timers])if(t.at<=now){timers.delete(key);t.fn();}},callback(script=scripts.at(-1)){return context.window[new URL(script.src).searchParams.get('callback')];}};
}
const data={total:10,counts:{'Test type':3}};

for(const file of ['shindan','shindan_result']) {
 test(`${file}: normal JSONP arriving after 14 seconds remains valid`,()=>{const h=setup(file);h.run('refreshStats()');h.advance(14000);assert.equal(h.run('STATS.status'),'loading');h.callback()(data);assert.match(h.region.innerHTML,/30%/);});
 test(`${file}: times out at 15 seconds and ignores its late callback`,()=>{const h=setup(file);h.run('refreshStats()');const late=h.callback();h.advance(15000);assert.equal(h.run('STATS.status'),'unavailable');assert.match(h.region.innerHTML,/出現率を再取得/);late(data);assert.equal(h.run('STATS.status'),'unavailable');});
 test(`${file}: network error exposes a retry that succeeds without duplicate GETs`,()=>{const h=setup(file);h.run('refreshStats()');h.scripts[0].onerror();h.run('retryStats();retryStats();refreshStats()');assert.equal(h.scripts.length,2);assert.equal(h.run('STATS.status'),'loading');h.callback()(data);assert.equal(h.run('STATS.status'),'ready');});
 test(`${file}: malformed response and retry failure leave another retry available`,()=>{const h=setup(file);h.run('refreshStats()');h.callback()({total:'10',counts:{}});assert.equal(h.run('STATS.status'),'unavailable');h.run('retryStats()');h.callback()({total:10,counts:{bad:11}});assert.equal(h.run('STATS.status'),'unavailable');assert.match(h.region.innerHTML,/出現率を再取得/);});
 test(`${file}: old response cannot overwrite a newer request`,()=>{const h=setup(file);h.run('refreshStats()');const late=h.callback();h.advance(15000);h.run('retryStats()');h.callback()(data);late({total:100,counts:{'Test type':99}});assert.equal(h.run('STATS.total'),10);});
 test(`${file}: cancellation on leaving prevents updates to a new screen`,()=>{const h=setup(file);h.run('refreshStats()');const late=h.callback();h.run('cancelStatsLoad();currentScreen="intro"');h.advance(20000);late(data);assert.notEqual(h.run('STATS.status'),'ready');h.run('currentScreen="result";refreshStats()');h.callback()(data);assert.equal(h.run('STATS.status'),'ready');});
 test(`${file}: rerender preserves loaded stats and empty data is not an error`,()=>{const h=setup(file);h.run('refreshStats()');h.callback()({total:0,counts:{}});h.run('updateStatsDisplay();retryStats()');assert.match(h.region.innerHTML,/集計データはまだありません/);assert.equal(h.scripts.length,1);});
}

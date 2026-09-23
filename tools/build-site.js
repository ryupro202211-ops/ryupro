const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '_site');
if (out !== path.join(root, '_site')) throw new Error('Unexpected build output path');
const excluded = /(^|\/)(docs|tests|node_modules|\.git|\.github|\.claude|__pycache__|_site|tools|test-results|playwright-report|blob-report|coverage)(\/|$)|(^|\/)(package\.json|package-lock\.json|server\.js|start\.sh|playwright\.config\.(?:js|cjs|mjs|ts)|\.gitignore|blog\/CONTENT-PLAN\.md|blog\/data\/theme-plan\.json)$/i;
const secret = /(^|\/)(\.env[^/]*|\.npmrc|\.pypirc|id_rsa(\..*)?|id_ed25519(\..*)?|[^/]*(secret|credential|private[-_]?key)[^/]*|[^/]+\.(pem|key|p12|pfx|keystore))$/i;
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
for (const file of ['assets/css/corporate.css', 'assets/css/corporate-motion.css', 'assets/js/corporate.js', 'assets/js/contact.js', 'assets/js/corporate-motion.js']) if (!files.includes(file)) files.push(file);
const allowed = files.filter(file => !excluded.test(file.replace(/\\/g, '/')) && !secret.test(file.replace(/\\/g, '/')));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of allowed) {
  const source = path.resolve(root, file);
  if (!source.startsWith(root + path.sep) || !fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
  const target = path.resolve(out, file);
  if (!target.startsWith(out + path.sep)) throw new Error(`Unsafe target: ${file}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
const home = path.join(out, 'index.html');
if (!fs.existsSync(home)) throw new Error('index.html missing from site artifact');
const journal = require('./build-home-journal');
const args = process.argv.slice(2);
const todayArg = args.find(arg => arg.startsWith('--today='));
const today = todayArg ? todayArg.slice('--today='.length) : undefined;
fs.writeFileSync(home, journal.update(fs.readFileSync(home, 'utf8'), today), 'utf8');
console.log(`Built ${allowed.length} allowed site files into _site`);

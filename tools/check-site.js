const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const siteRoot = path.join(root, '_site');
const errors = [];
const requiredFiles = [
  'index.html',
  'contact/index.html',
  'blog/index.html',
  'assets/css/corporate.css',
  'assets/js/corporate.js',
  'assets/js/contact.js',
  '.nojekyll'
];
const forbiddenPaths = [
  'docs', 'tests', 'node_modules', '.git', '.github', '.claude',
  '__pycache__', 'tools', 'test-results', 'playwright-report', 'blob-report', 'coverage',
  'playwright.config.js', 'package.json', 'package-lock.json',
  '.gitignore', 'server.js', 'start.sh',
  'blog/CONTENT-PLAN.md', 'blog/data/theme-plan.json'
];
const secretPath = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|id_rsa(?:\..*)?|id_ed25519(?:\..*)?|[^/]*(?:secret|credential|private[-_]?key)[^/]*|[^/]+\.(?:pem|key|p12|pfx|keystore))$/i;
const localPages = ['index.html', 'contact/index.html'];

function fail(message) {
  errors.push(message);
}

function decodeAttribute(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[match[1].toLowerCase()] = decodeAttribute(match[2] ?? match[3] ?? '');
  }
  return result;
}

function idSet(html) {
  return new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => decodeAttribute(match[1])));
}

function resolveSiteTarget(href, sourcePage) {
  const basePath = sourcePage === 'contact/index.html' ? '/ryupro/contact/' : '/ryupro/';
  let url;
  try {
    url = new URL(href, `https://ryupro-local.invalid${basePath}`);
  } catch {
    fail(`Invalid URL in ${sourcePage}`);
    return null;
  }
  if (url.origin !== 'https://ryupro-local.invalid') return null;
  if (!url.pathname.startsWith('/ryupro/')) {
    fail(`Local URL is outside /ryupro/: ${sourcePage}`);
    return null;
  }

  let relative;
  try {
    relative = decodeURIComponent(url.pathname.slice('/ryupro/'.length));
  } catch {
    fail(`Invalid path encoding in ${sourcePage}`);
    return null;
  }
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  else if (!path.posix.extname(relative)) relative += '/index.html';
  const target = path.resolve(siteRoot, relative);
  if (!target.startsWith(siteRoot + path.sep)) {
    fail(`Path escapes the site output in ${sourcePage}`);
    return null;
  }
  return { url, relative: relative.replace(/\\/g, '/'), target };
}

if (!fs.existsSync(siteRoot)) fail('Run npm run build:site before npm run check:site.');
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(siteRoot, file))) fail(`Required output is missing: ${file}`);
}
for (const item of forbiddenPaths) {
  if (fs.existsSync(path.join(siteRoot, item))) fail(`Development file or directory is included: ${item}`);
}

let outputFileCount = 0;
function scanOutput(directory, prefix = '') {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (secretPath.test(relative)) fail(`Potential secret file in output: ${relative}`);
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) scanOutput(fullPath, relative);
    else if (entry.isFile()) outputFileCount += 1;
  }
}
scanOutput(siteRoot);

const idCache = new Map();
function checkFragment(relative, target, fragment, sourcePage) {
  if (!fragment || !relative.toLowerCase().endsWith('.html')) return;
  if (!idCache.has(relative)) idCache.set(relative, idSet(fs.readFileSync(target, 'utf8')));
  let decoded;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    fail(`Invalid fragment encoding in ${sourcePage}`);
    return;
  }
  if (!idCache.get(relative).has(decoded)) fail(`Missing fragment #${decoded} in ${relative} (linked from ${sourcePage})`);
}

const allowedTypes = new Set(['event', 'community', 'career', 'lifestyle', 'work-life', 'partnership', 'other']);
const allowedSources = new Set(['hero', 'header', 'services', 'contact', 'footer', 'direct']);
let localLinkCount = 0;
let queryValueCount = 0;
const pageIds = new Map();
for (const page of localPages) {
  const file = path.join(siteRoot, page);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const ids = idSet(html);
  pageIds.set(page, ids);
  for (const tagMatch of html.matchAll(/<(?:a|link|script|img|source)\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    const attrs = attributes(tag);
    for (const attribute of ['href', 'src']) {
      if (!attrs[attribute] || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(attrs[attribute])) continue;
      const targetInfo = resolveSiteTarget(attrs[attribute], page);
      if (!targetInfo) continue;
      if (!fs.existsSync(targetInfo.target) || !fs.statSync(targetInfo.target).isFile()) {
        fail(`Missing local resource: ${page} -> ${attrs[attribute]}`);
        continue;
      }
      localLinkCount += 1;
      checkFragment(targetInfo.relative, targetInfo.target, targetInfo.url.hash.slice(1), page);
      for (const key of ['type', 'source']) {
        if (!targetInfo.url.searchParams.has(key)) continue;
        const allowlist = key === 'type' ? allowedTypes : allowedSources;
        for (const value of targetInfo.url.searchParams.getAll(key)) {
          queryValueCount += 1;
          if (!allowlist.has(value)) fail(`Unapproved contact ${key} value in ${page}`);
        }
      }
    }
  }

  for (const imageMatch of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!Object.hasOwn(attributes(imageMatch[0]), 'alt')) fail(`Image without alt attribute in ${page}`);
  }
}

const homeIds = pageIds.get('index.html') || new Set();
for (const id of ['main', 'services', 'community', 'projects', 'journal', 'founder', 'philosophy', 'company', 'contact']) {
  if (!homeIds.has(id)) fail(`Required homepage anchor is missing: #${id}`);
}
const contactHtmlPath = path.join(siteRoot, 'contact/index.html');
if (fs.existsSync(contactHtmlPath)) {
  const contactHtml = fs.readFileSync(contactHtmlPath, 'utf8');
  const labelIds = new Set([...contactHtml.matchAll(/<label\b[^>]*for=["']([^"']+)["']/gi)].map(match => match[1]));
  for (const id of ['type', 'name', 'email', 'subject', 'message']) {
    if (!labelIds.has(id)) fail(`Contact field is missing a label: ${id}`);
  }
  if (!/<noscript>[\s\S]*?mailto:ryupro202211@gmail\.com[\s\S]*?<\/noscript>/i.test(contactHtml)) {
    fail('Contact page is missing its no-JavaScript mailto fallback.');
  }
}

const homePath = path.join(siteRoot, 'index.html');
if (fs.existsSync(homePath)) {
  const homeHtml = fs.readFileSync(homePath, 'utf8');
  const cards = (homeHtml.match(/class="journal-card"/g) || []).length;
  if (cards > 3) fail(`Journal output contains ${cards} cards; maximum is three.`);
}

const contactJsPath = path.join(siteRoot, 'assets/js/contact.js');
if (fs.existsSync(contactJsPath)) {
  const contactJs = fs.readFileSync(contactJsPath, 'utf8');
  if (!contactJs.includes("new Set(['event', 'community', 'career', 'lifestyle', 'work-life', 'partnership', 'other'])")) {
    fail('Contact type allowlist is missing or unexpected.');
  }
  if (!contactJs.includes("new Set(['hero', 'header', 'services', 'contact', 'footer', 'direct'])")) {
    fail('Contact source allowlist is missing or unexpected.');
  }
  if (/localStorage|sessionStorage|console\.(?:log|info|warn|error)/.test(contactJs)) {
    fail('Contact data is written to browser storage or logged to the console.');
  }
}

const cssPath = path.join(siteRoot, 'assets/css/corporate.css');
if (fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, 'utf8');
  if (!/\.corporate-site \.nav-toggle\[hidden\]\s*\{\s*display:\s*none;\s*\}/.test(css)) {
    fail('The hidden navigation toggle is not explicitly hidden in CSS.');
  }
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/i.test(css)) {
    fail('Reduced-motion styles are missing.');
  }
  const variables = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})/gi)].map(match => [match[1], match[2]]));
  const rule = selector => css.match(new RegExp(`${selector}[^\\{]*\\{([^}]+)\\}`))?.[1];
  const color = (block, property) => block?.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`, 'i'))?.[1].trim();
  const resolveColor = value => {
    const variable = value?.match(/^var\(--([\w-]+)\)$/i)?.[1];
    const resolved = variable ? variables[variable] : value;
    if (!resolved) return null;
    if (/^#[0-9a-f]{3}$/i.test(resolved)) return `#${[...resolved.slice(1)].map(char => char + char).join('')}`;
    return /^#[0-9a-f]{6}$/i.test(resolved) ? resolved : null;
  };
  const inputRule = rule('\\.corporate-site \\.form-field input,');
  const requiredRule = rule('\\.corporate-site \\.field-required,');
  const statusRule = rule('\\.corporate-site \\.form-status');
  const bodyRule = rule('body\\.corporate-site');
  const inputForeground = resolveColor(color(inputRule, 'color'));
  const inputBackground = resolveColor(color(inputRule, 'background'));
  const requiredForeground = resolveColor(color(requiredRule, 'color'));
  const statusForeground = resolveColor(color(statusRule, 'color'));
  const pageBackground = resolveColor(color(bodyRule, 'background'));
  if (!inputForeground || !inputBackground || !requiredForeground || !statusForeground || !pageBackground) {
    fail('Form contrast colors could not be read from the CSS rules.');
  }
  const luminance = color => {
    const channels = color.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
    const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const contrast = (foreground, background) => {
    const first = luminance(foreground);
    const second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  };
  const formColors = [
    ['input text', inputForeground, inputBackground],
    ['required field label', requiredForeground, pageBackground],
    ['form status', statusForeground, pageBackground]
  ];
  for (const [name, foreground, background] of formColors) {
    if (foreground && background && contrast(foreground, background) < 4.5) fail(`Form text contrast is below 4.5:1: ${name}`);
  }
}

if (errors.length) {
  console.error(`Site check failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Site check passed: ${outputFileCount} output files, ${localLinkCount} local links/resources, ${queryValueCount} allowlisted contact query values.`);
}

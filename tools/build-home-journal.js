const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const START = '<!-- HOME_JOURNAL_START -->';
const END = '<!-- HOME_JOURNAL_END -->';
const normalizedDate = value => String(value || '').replaceAll('.', '-');
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function safeFileUrl(value, prefixes) {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('://') || value.startsWith('//')) return null;
  const normalized = value.replace(/^\.\//, '').replace(/^\//, '');
  if (normalized.split('/').some(part => part === '..') || !prefixes.some(prefix => normalized.startsWith(prefix))) return null;
  const diskPath = path.resolve(root, normalized);
  if (!diskPath.startsWith(root + path.sep) || !fs.existsSync(diskPath) || !fs.statSync(diskPath).isFile()) return null;
  return '/' + normalized.split('/').map(encodeURIComponent).join('/');
}
function validDate(value) {
  const normalized = normalizedDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const date = new Date(`${normalized}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === normalized;
}
function render(today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) {
  const posts = JSON.parse(fs.readFileSync(path.join(root, 'blog/data/posts.json'), 'utf8'));
  if (!Array.isArray(posts)) throw new Error('blog/data/posts.json must contain an array');
  const cards = posts.filter(post => post && validDate(post.date) && normalizedDate(post.date) <= today && safeFileUrl(`blog/${post.url}`, ['blog/']))
    .sort((a, b) => normalizedDate(b.date).localeCompare(normalizedDate(a.date))).slice(0, 3).map(post => {
      const href = safeFileUrl(`blog/${post.url}`, ['blog/']);
      const image = safeFileUrl(post.image, ['blog/', 'assets/']);
      const date = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${normalizedDate(post.date)}T00:00:00+09:00`));
      return `<article class="journal-card">${image ? `<a href="/ryupro/${escapeHtml(href.slice(1))}"><img src="/ryupro/${escapeHtml(image.slice(1))}" alt="" loading="lazy" decoding="async"></a>` : ''}<div><time datetime="${escapeHtml(normalizedDate(post.date))}">${escapeHtml(date)}</time><h3><a href="/ryupro/${escapeHtml(href.slice(1))}">${escapeHtml(post.title || 'ブログ記事')}</a></h3><p>${escapeHtml(post.excerpt || '')}</p></div></article>`;
    });
  return cards.length ? `<div class="journal-list">\n${cards.join('\n')}\n</div>` : '<div class="journal-list"><p>記事は準備中です。</p><a class="text-link" href="/ryupro/blog/">ブログ一覧へ<span aria-hidden="true">↗</span></a></div>';
}
function update(html, today) {
  if (html.split(START).length !== 2 || html.split(END).length !== 2) throw new Error('Journal markers must appear exactly once');
  const start = html.indexOf(START) + START.length;
  const end = html.indexOf(END);
  if (end < start) throw new Error('Journal markers are out of order');
  return html.slice(0, start) + '\n' + render(today) + '\n        ' + html.slice(end);
}
module.exports = { render, update };

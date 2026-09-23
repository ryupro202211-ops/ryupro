const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const generatorPath = path.join(root, 'tools', 'build-home-journal.js');
const dataPath = path.join(root, 'blog', 'data', 'posts.json');
const source = fs.readFileSync(generatorPath, 'utf8');

function renderWith(rawPosts, today = '2026-09-23', availableFiles = []) {
  const mockFs = {
    readFileSync(file) {
      if (file !== dataPath) throw new Error(`Unexpected read: ${file}`);
      return typeof rawPosts === 'string' ? rawPosts : JSON.stringify(rawPosts);
    },
    existsSync(file) {
      return availableFiles.includes(path.relative(root, file).replaceAll('\\', '/'));
    },
    statSync() {
      return { isFile: () => true };
    }
  };
  const module = { exports: {} };
  const context = {
    __dirname: path.join(root, 'tools'),
    module,
    exports: module.exports,
    require(name) {
      if (name === 'node:fs') return mockFs;
      if (name === 'node:path') return path;
      throw new Error(`Unexpected module: ${name}`);
    }
  };
  vm.runInNewContext(source, context, { filename: generatorPath });
  return module.exports.render(today);
}

test('sorts valid published articles, limits the journal to three, and excludes future or impossible dates', () => {
  const html = renderWith([
    { title: 'Second', date: '2026.09.22', url: 'posts/second.html' },
    { title: 'Future', date: '2026.09.24', url: 'posts/future.html' },
    { title: 'Newest', date: '2026.09.23', url: 'posts/newest.html' },
    { title: 'Impossible', date: '2026.02.30', url: 'posts/impossible.html' },
    { title: 'Third', date: '2026.09.20', url: 'posts/third.html' },
    { title: 'Fourth', date: '2026.09.19', url: 'posts/fourth.html' }
  ], '2026-09-23', [
    'blog/posts/second.html', 'blog/posts/future.html', 'blog/posts/newest.html',
    'blog/posts/impossible.html', 'blog/posts/third.html', 'blog/posts/fourth.html'
  ]);

  assert.ok(html.indexOf('Newest') < html.indexOf('Second'));
  assert.ok(html.indexOf('Second') < html.indexOf('Third'));
  assert.equal((html.match(/class="journal-card"/g) || []).length, 3);
  assert.doesNotMatch(html, /Future|Impossible|Fourth/);
});

test('escapes article text and rejects traversal or external image URLs', () => {
  const html = renderWith([
    {
      title: '<script>alert("x")</script>',
      excerpt: '<img src=x onerror=alert(1)>',
      date: '2024.02.29',
      url: '../outside.html',
      image: 'https://example.com/image.png'
    }
  ], '2026-09-23');

  assert.match(html, /記事は準備中です/);
  assert.doesNotMatch(html, /<script>|onerror=|example\.com/);
});

test('keeps an article when its image is missing and omits the broken image', () => {
  const html = renderWith([
    { title: '画像なしの記事', excerpt: '本文の要約', date: '2026.09.22', url: 'posts/no-image.html', image: 'blog/posts/missing.png' }
  ], '2026-09-23', ['blog/posts/no-image.html']);

  assert.match(html, /画像なしの記事/);
  assert.match(html, /本文の要約/);
  assert.doesNotMatch(html, /<img\b/);
});

test('uses a useful fallback for an empty list and rejects malformed or non-array JSON', () => {
  assert.match(renderWith([], '2026-09-23'), /記事は準備中です/);
  assert.throws(() => renderWith('{broken', '2026-09-23'), error => error.name === 'SyntaxError');
  assert.throws(() => renderWith('{"title":"not an array"}', '2026-09-23'), /must contain an array/);
});

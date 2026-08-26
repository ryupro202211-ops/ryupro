#!/usr/bin/env node
/**
 * ryupro ブログ 週次投稿ツール
 *
 *   node tools/new-post.js --next                 次に書く週のテーマを表示
 *   node tools/new-post.js --list                 全40週の一覧
 *   node tools/new-post.js --sitemap              sitemap.xml だけ作り直す
 *   node tools/new-post.js --week 2 --body drafts/w02.html [--excerpt "..."] [--image /blog/posts/images/x.jpg]
 *
 * blog/data/theme-plan.json の該当週から記事HTMLを生成し、
 * blog/data/posts.json の先頭に追加、sitemap.xml を再生成する。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLAN_PATH = path.join(ROOT, 'blog', 'data', 'theme-plan.json');
const POSTS_PATH = path.join(ROOT, 'blog', 'data', 'posts.json');
const TEMPLATE_PATH = path.join(ROOT, 'blog', 'posts', 'template.html');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SITE = 'https://ryupro202211-ops.github.io/ryupro';
const DEFAULT_IMAGE = '/assets/images/default-blog.jpg';
const NL = '\n';

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJSON(p, v) { fs.writeFileSync(p, JSON.stringify(v, null, 4) + NL, 'utf8'); }

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[key] = true; }
      else { out[key] = next; i++; }
    } else { out._.push(a); }
  }
  return out;
}

// posts.json を正として sitemap.xml を作り直す（存在しない記事は載せない）
function rebuildSitemap(posts, latestDate) {
  const urls = [
    { loc: SITE + '/', lastmod: latestDate, changefreq: 'weekly', priority: '1.0' },
    { loc: SITE + '/blog/index.html', lastmod: latestDate, changefreq: 'weekly', priority: '0.8' },
    { loc: SITE + '/contact/index.html', lastmod: latestDate, changefreq: 'monthly', priority: '0.8' },
  ];
  posts.filter(function (p) {
    return fs.existsSync(path.join(ROOT, 'blog', p.url));
  }).forEach(function (p) {
    urls.push({
      loc: SITE + '/blog/' + p.url,
      lastmod: p.date.split('.').join('-'),
      changefreq: null,
      priority: '0.6',
    });
  });

  const body = urls.map(function (u) {
    const lines = ['    <loc>' + u.loc + '</loc>', '    <lastmod>' + u.lastmod + '</lastmod>'];
    if (u.changefreq) { lines.push('    <changefreq>' + u.changefreq + '</changefreq>'); }
    lines.push('    <priority>' + u.priority + '</priority>');
    return '  <url>' + NL + lines.join(NL) + NL + '  </url>';
  }).join(NL);

  fs.writeFileSync(SITEMAP_PATH,
    '<?xml version="1.0" encoding="UTF-8"?>' + NL +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + NL +
    body + NL + '</urlset>' + NL, 'utf8');
  return urls.length;
}

function describe(w) {
  return [
    '  第' + w.week + '回  ' + w.date + ' (水)  [' + w.status + ']',
    '  カテゴリ : ' + w.category_label + '（' + w.service + '）',
    '  タイトル : ' + w.title,
    '  元ネタ   : ' + w.source,
    '  切り口   : ' + w.angle,
    '  CTA      : ' + w.cta.label + ' -> ' + w.cta.url,
    '  note公開 : ' + (w.note_published ? '済（HP版は書き換えること）' : '未（新規ネタ）'),
    '  出力先   : blog/posts/' + w.slug + '.html',
  ].join(NL);
}

// 本文HTMLの最初の<p>から抜粋を作る
function makeExcerpt(bodyHtml, limit) {
  const m = bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const raw = (m ? m[1] : bodyHtml).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return raw.length > limit ? raw.slice(0, limit - 1) + '…' : raw;
}

function latestPublishedDate(plan) {
  const dates = plan.weeks.filter(function (x) { return x.status === 'published'; })
    .map(function (x) { return x.date; }).sort();
  return dates.length ? dates[dates.length - 1] : new Date().toISOString().slice(0, 10);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = readJSON(PLAN_PATH);

  if (args.list) {
    plan.weeks.forEach(function (w) {
      console.log(String(w.week).padStart(2) + ' ' + w.date +
        ' [' + (w.status === 'published' ? '公開済' : '未着手') + '] ' + w.title);
    });
    return;
  }

  if (args.sitemap) {
    const n = rebuildSitemap(readJSON(POSTS_PATH), latestPublishedDate(plan));
    console.log('sitemap.xml を再生成しました（' + n + ' URL）。');
    return;
  }

  if (args.next || Object.keys(args).length === 1) {
    const w = plan.weeks.find(function (x) { return x.status !== 'published'; });
    if (!w) { console.log('全' + plan.weeks.length + '週分が公開済みです。tools/_themes.py にテーマを追加してください。'); return; }
    console.log(NL + '次に書く記事:' + NL);
    console.log(describe(w));
    console.log(NL + '  書き終えたら:' + NL +
      '    node tools/new-post.js --week ' + w.week + ' --body <本文HTMLのパス>' + NL);
    return;
  }

  const weekNo = Number(args.week);
  if (!weekNo) { console.error('エラー: --week <番号> を指定してください。'); process.exit(1); }
  const w = plan.weeks.find(function (x) { return x.week === weekNo; });
  if (!w) { console.error('エラー: 第' + weekNo + '回は theme-plan.json にありません。'); process.exit(1); }
  if (!args.body || args.body === true) { console.error('エラー: --body <本文HTMLのパス> を指定してください。'); process.exit(1); }

  const bodyPath = path.isAbsolute(args.body) ? args.body : path.join(ROOT, args.body);
  if (!fs.existsSync(bodyPath)) { console.error('エラー: 本文が見つかりません: ' + bodyPath); process.exit(1); }
  const body = fs.readFileSync(bodyPath, 'utf8').trim();
  if (!body) { console.error('エラー: 本文が空です: ' + bodyPath); process.exit(1); }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const html = template
    .split('{{TITLE}}').join(w.title)
    .split('{{DATE}}').join(w.date_display)
    .split('{{CONTENT}}').join(body);
  fs.writeFileSync(path.join(ROOT, 'blog', 'posts', w.slug + '.html'), html, 'utf8');

  const posts = readJSON(POSTS_PATH);
  const entry = {
    id: w.slug,
    title: w.title,
    date: w.date_display,
    excerpt: (typeof args.excerpt === 'string' ? args.excerpt : makeExcerpt(body, 110)),
    // content は server.js の再生成と admin パネルの編集で使われる。必ず入れること。
    content: body,
    image: (typeof args.image === 'string' ? args.image : DEFAULT_IMAGE),
    url: 'posts/' + w.slug + '.html',
  };
  const idx = posts.findIndex(function (p) { return p.id === entry.id; });
  if (idx >= 0) { posts[idx] = entry; } else { posts.unshift(entry); }
  posts.sort(function (a, b) { return b.date.localeCompare(a.date); });
  writeJSON(POSTS_PATH, posts);

  w.status = 'published';
  fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2) + NL, 'utf8');

  const nUrl = rebuildSitemap(posts, w.date);

  console.log('公開しました: blog/posts/' + w.slug + '.html');
  console.log('posts.json に追加: ' + entry.title);
  console.log('sitemap.xml を更新: ' + nUrl + ' URL');
  console.log(NL + '  git add -A && git commit -m "blog: 第' + w.week + '回 ' + w.headline + '" && git push');
}

main();

#!/usr/bin/env node
/**
 * blog/data/posts.json の content から記事HTMLを一括で作り直す。
 *
 *   node tools/rebuild-posts.js
 *
 * テンプレート（blog/posts/template.html）を変更したあとに実行する。
 * server.js の起動時再生成と同じ処理を、サーバーを立てずに実行できる。
 *
 * content を持たない記事（手書きHTML）は本文が消えるためスキップする。
 * その場合は該当ファイルを直接編集すること。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { renderPost } = require('./render-post');

const ROOT = path.join(__dirname, '..');
const POSTS_PATH = path.join(ROOT, 'blog', 'data', 'posts.json');
const TEMPLATE_PATH = path.join(ROOT, 'blog', 'posts', 'template.html');
const POSTS_DIR = path.join(ROOT, 'blog', 'posts');

const posts = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

const rebuilt = [];
const skipped = [];

posts.forEach(function (post) {
  const hasContent = typeof post.content === 'string' && post.content.trim().length > 0;
  const fileName = (post.url || ('posts/' + post.id + '.html')).split('/').pop();

  if (fileName === 'template.html') {
    skipped.push(post.id + '（template.html を指しているため保護）');
    return;
  }
  if (!hasContent) {
    skipped.push(post.id + '（content なし・手書きHTML）');
    return;
  }

  fs.writeFileSync(path.join(POSTS_DIR, fileName), renderPost(template, post), 'utf8');
  rebuilt.push(fileName);
});

console.log('再生成: ' + rebuilt.length + '件');
rebuilt.forEach(function (f) { console.log('  + ' + f); });
if (skipped.length) {
  console.log('スキップ: ' + skipped.length + '件');
  skipped.forEach(function (f) { console.log('  = ' + f); });
}

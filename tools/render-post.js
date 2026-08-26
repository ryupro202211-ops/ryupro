/**
 * 記事HTMLの組み立てを一箇所に集約したモジュール。
 *
 * blog/posts/template.html のプレースホルダを埋める処理は、これまで
 *   - tools/new-post.js（週次投稿）
 *   - server.js（ローカル開発サーバー／管理画面）
 * の2箇所に別々に書かれていて、片方だけ更新されると出力がズレる原因になっていた。
 * 両方からこのモジュールを呼ぶことで、生成結果が必ず一致するようにする。
 */
'use strict';

const SITE = 'https://ryupro202211-ops.github.io/ryupro';
// 一覧カードのサムネイル既定値（4:3）
const DEFAULT_IMAGE = '/assets/images/default-blog.jpg';
// OGP 既定値。SNS カードは 1.91:1 が前提なので専用に切り出したものを使う。
const OG_FALLBACK_IMAGE = '/assets/images/ogp.jpg';

/** 属性値として安全にする（タイトルや抜粋に & " < > が入っても壊れないように） */
function escapeAttr(v) {
  return String(v === undefined || v === null ? '' : v)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');
}

/** 相対パスを絶対URLへ */
function absoluteUrl(u) {
  if (!u) { return SITE + OG_FALLBACK_IMAGE; }
  if (u.indexOf('http') === 0) { return u; }
  return SITE + (u.charAt(0) === '/' ? u : '/' + u);
}

/**
 * OGP 用の画像URL。
 * 記事固有の画像がなく汎用サムネイルのままなら、SNS カード比率の ogp.jpg に差し替える。
 */
function ogImageUrl(image) {
  if (!image || image === DEFAULT_IMAGE) { return SITE + OG_FALLBACK_IMAGE; }
  return absoluteUrl(image);
}

/** "2026.08.26" -> "2026-08-26" */
function toIsoDate(dateDisplay) {
  return String(dateDisplay || '').split('.').join('-');
}

/**
 * テンプレートに記事を流し込む。
 *
 * @param {string} template blog/posts/template.html の中身
 * @param {object} post { title, date, excerpt, content, image, url }
 *                      url は 'posts/xxxx.html' 形式（blog/ からの相対）
 * @returns {string} 完成した記事HTML
 *
 * 置換に String.replace(regexp, ...) を使うと、置換文字列中の "$&" などが
 * 特別扱いされて本文が壊れる。split/join で literal 置換する。
 */
function renderPost(template, post) {
  const relUrl = post.url || ('posts/' + post.id + '.html');
  return template
    .split('{{TITLE}}').join(escapeAttr(post.title))
    .split('{{DATE}}').join(post.date)
    .split('{{DATE_ISO}}').join(toIsoDate(post.date))
    .split('{{EXCERPT}}').join(escapeAttr(post.excerpt))
    .split('{{URL}}').join(SITE + '/blog/' + relUrl)
    .split('{{IMAGE}}').join(ogImageUrl(post.image))
    .split('{{CONTENT}}').join(post.content || '');
}

module.exports = { SITE, DEFAULT_IMAGE, OG_FALLBACK_IMAGE, escapeAttr, absoluteUrl, ogImageUrl, toIsoDate, renderPost };

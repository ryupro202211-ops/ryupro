/**
 * ryupro HP ローカル確認用の静的サーバー。
 *
 *   npm start   (= node server.js)   -> http://localhost:3001
 *
 * かつては管理画面（/admin）と記事の作成・更新・削除APIを持っていたが、
 * 週次のブログ運用を tools/ 側に一本化したため、それらは廃止した。
 *
 * 廃止したもの（履歴は git に残っている）:
 *   - 起動時に posts.json の content から blog/posts/*.html を全再生成する処理
 *     → content を持たない手書き記事の本文を空で上書きする事故が起きていた。
 *        テンプレートや blog.css を変えたあとの再生成は
 *        `node tools/rebuild-posts.js` で明示的に実行する。
 *   - POST /api/posts, DELETE /api/posts と /assets/uploads への画像アップロード
 *     → 記事の追加は `node tools/new-post.js --week N --body <file>` に統一。
 *   - /admin の管理画面（実体のHTMLは既に存在しなかった）
 *
 * つまりこのサーバーはファイルを一切書き換えない。表示確認だけに使う。
 */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
    console.log(`ryupro HP: http://localhost:${PORT}`);
    console.log(`ブログ    : http://localhost:${PORT}/blog/`);
    console.log('※ このサーバーはファイルを書き換えません（表示確認のみ）');
});

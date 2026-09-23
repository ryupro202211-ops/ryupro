/**
 * ryupro HP local static preview server.
 * npm start -> project root, npm run preview -> generated _site.
 */
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;
const args = process.argv.slice(2);
let root = __dirname;
const dirIndex = args.indexOf('--dir');
if (dirIndex >= 0) {
  if (!args[dirIndex + 1]) throw new Error('--dir requires a directory');
  root = path.resolve(__dirname, args[dirIndex + 1]);
  if (!root.startsWith(path.resolve(__dirname) + path.sep) || !require('node:fs').existsSync(root)) throw new Error('Preview directory must exist inside the project');
}
app.use('/ryupro', express.static(root));
app.use(express.static(root));
app.listen(PORT, () => {
  console.log(`ryupro HP: http://localhost:${PORT}`);
  console.log(`ブログ    : http://localhost:${PORT}/blog/`);
  console.log('このサーバーはファイルを書き換えません。');
});

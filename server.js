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
// Browser tests must never receive the production contact endpoint.
if (process.env.RYUPRO_CONTACT_TEST_MODE === '1') {
  app.get(['/assets/js/contact-settings.js', '/ryupro/assets/js/contact-settings.js'], (request, response) => {
    response.type('application/javascript').send("window.ryuproContactSettings = window.ryuproContactSettings || { mode: 'mailto', endpoint: '' };\n");
  });
}
app.use('/ryupro', express.static(root));
app.use(express.static(root));
app.listen(PORT, () => {
  console.log(`ryupro HP: http://localhost:${PORT}`);
  console.log(`ブログ    : http://localhost:${PORT}/blog/`);
  console.log('このサーバーはファイルを書き換えません。');
});

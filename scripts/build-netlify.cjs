/* Production frontend only. Secrets and runtime files never enter dist. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Invalid output path');
fs.rmSync(output, {recursive: true, force: true});
fs.mkdirSync(output, {recursive: true});
fs.cpSync(path.join(root, 'public'), output, {recursive: true});
fs.writeFileSync(path.join(output, 'assets/deployment.js'),
  'window.SEWARUMA_STATIC_DEMO = false;\nwindow.SEWARUMA_NETLIFY = true;\n');
console.log('Production frontend built. API: Netlify Functions; database/storage: Supabase.');

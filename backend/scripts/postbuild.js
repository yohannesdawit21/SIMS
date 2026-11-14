const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'dist', 'src');
const srcMain = path.join(srcDir, 'main.js');

try {
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
  }

  // Write a clean CommonJS redirect to dist/main.js
  // When Render runs 'node dist/src/main', it delegates directly to dist/main.js
  // ensuring all sibling requires (./app.module, etc.) resolve relative to dist/
  fs.writeFileSync(srcMain, "require('../main');\n", 'utf8');
  console.log('[postbuild] Created dist/src/main.js redirect -> dist/main.js');
} catch (err) {
  console.warn('[postbuild] Warning:', err.message);
}

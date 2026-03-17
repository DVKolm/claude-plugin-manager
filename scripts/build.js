const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Compile TypeScript
execSync('npx tsc', { stdio: 'inherit' });

// Copy UI files to dist/ui/
const uiSrc = path.join(__dirname, '..', 'ui');
const uiDist = path.join(__dirname, '..', 'dist', 'ui');

fs.mkdirSync(uiDist, { recursive: true });

for (const file of fs.readdirSync(uiSrc)) {
  fs.copyFileSync(path.join(uiSrc, file), path.join(uiDist, file));
}

console.log('Build complete: dist/');

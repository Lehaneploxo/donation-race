const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../node_modules/tiktok-live-connector/dist/index.js');

if (!fs.existsSync(file)) {
  console.log('[patch] tiktok-live-connector not found, skipping');
  process.exit(0);
}

let code = fs.readFileSync(file, 'utf8');

const from = `  if (!webcastResponse.cursor) {
    if (isInitial) {
      throw new InvalidResponseError('Missing cursor in initial fetch response.');
    } else {
      _classPrivateMethodGet(this, _handleError, _handleError2).call(this, null, 'Missing cursor in fetch response.');
    }
  }`;

const to = `  if (!webcastResponse.cursor) {
    if (!isInitial) {
      _classPrivateMethodGet(this, _handleError, _handleError2).call(this, null, 'Missing cursor in fetch response.');
    }
    // cursor may be absent on initial fetch — continue anyway
  }`;

if (code.includes(to)) {
  console.log('[patch] already applied');
  process.exit(0);
}

if (!code.includes(from)) {
  console.log('[patch] pattern not found — skipping (library may have changed)');
  process.exit(0);
}

fs.writeFileSync(file, code.replace(from, to), 'utf8');
console.log('[patch] tiktok-live-connector cursor fix applied');

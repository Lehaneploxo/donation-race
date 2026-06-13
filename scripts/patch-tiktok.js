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

// If initial fetch has no cursor = stream not live. Throw so connect() rejects and we retry later.
// If poll has no cursor = transient error, just log it.
const to = `  if (!webcastResponse.cursor) {
    if (isInitial) {
      throw new Error('Stream not live or not found (no cursor in initial response).');
    } else {
      _classPrivateMethodGet(this, _handleError, _handleError2).call(this, null, 'Missing cursor in fetch response.');
    }
  }`;

if (code.includes(to)) {
  console.log('[patch] already applied');
  process.exit(0);
}

if (!code.includes(from)) {
  console.log('[patch] pattern not found — library may have changed');
  process.exit(0);
}

fs.writeFileSync(file, code.replace(from, to), 'utf8');
console.log('[patch] applied: no-cursor = not live, throw to trigger retry');

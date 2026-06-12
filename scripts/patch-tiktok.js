const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../node_modules/tiktok-live-connector/dist/index.js');

if (!fs.existsSync(file)) {
  console.log('[patch] tiktok-live-connector not found, skipping');
  process.exit(0);
}

let code = fs.readFileSync(file, 'utf8');

// Patch 1: suppress throw on missing cursor in initial fetch + add diagnostic logging for polls
const from1 = `  if (!webcastResponse.cursor) {
    if (isInitial) {
      throw new InvalidResponseError('Missing cursor in initial fetch response.');
    } else {
      _classPrivateMethodGet(this, _handleError, _handleError2).call(this, null, 'Missing cursor in fetch response.');
    }
  }`;

const to1 = `  if (!webcastResponse.cursor) {
    if (!isInitial) {
      const msgCount = (webcastResponse.messages || []).length;
      const hasExt = !!webcastResponse.internalExt;
      console.log('[patch] poll: no cursor, messages=' + msgCount + ', internalExt=' + hasExt + ', keys=' + Object.keys(webcastResponse).join(','));
      _classPrivateMethodGet(this, _handleError, _handleError2).call(this, null, 'Missing cursor in fetch response.');
    }
    // If cursor missing on initial fetch, continue anyway (TikTok API may omit cursor)
  }`;

if (code.includes(to1)) {
  console.log('[patch] patch1 already applied');
} else if (code.includes(from1)) {
  code = code.replace(from1, to1);
  console.log('[patch] patch1 applied: cursor fix + diagnostic logging');
} else {
  console.log('[patch] patch1 pattern not found — library may have changed');
}

fs.writeFileSync(file, code, 'utf8');
console.log('[patch] done');

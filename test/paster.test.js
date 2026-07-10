const test = require('node:test');
const assert = require('node:assert');
const { PASTE_SCRIPT, sendPasteKeystroke } = require('../src/main/paster');

test('paste script sends cmd+v via System Events', () => {
  assert.strictEqual(PASTE_SCRIPT, 'tell application "System Events" to keystroke "v" using command down');
});

test('sendPasteKeystroke invokes osascript with the script', () => {
  const calls = [];
  sendPasteKeystroke((file, args) => calls.push([file, args]));
  assert.deepStrictEqual(calls, [['/usr/bin/osascript', ['-e', PASTE_SCRIPT]]]);
});

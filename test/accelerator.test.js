const test = require('node:test');
const assert = require('node:assert');
const { eventToAccelerator, formatAccelerator, keyFromCode } = require('../src/renderer/accelerator');

const ev = (over) => ({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, code: 'KeyA', ...over });

test('letters, digits, space, F-keys, arrows, punctuation map to accelerators', () => {
  assert.strictEqual(eventToAccelerator(ev({ metaKey: true, code: 'KeyV' })), 'Command+V');
  assert.strictEqual(eventToAccelerator(ev({ ctrlKey: true, code: 'Digit3' })), 'Control+3');
  assert.strictEqual(eventToAccelerator(ev({ metaKey: true, altKey: true, code: 'Space' })), 'Command+Alt+Space');
  assert.strictEqual(eventToAccelerator(ev({ altKey: true, code: 'F6' })), 'Alt+F6');
  assert.strictEqual(eventToAccelerator(ev({ metaKey: true, code: 'ArrowUp' })), 'Command+Up');
  assert.strictEqual(eventToAccelerator(ev({ metaKey: true, code: 'Slash' })), 'Command+/');
  assert.strictEqual(eventToAccelerator(ev({ metaKey: true, shiftKey: true, code: 'KeyV' })), 'Command+Shift+V');
  assert.strictEqual(eventToAccelerator(ev({ ctrlKey: true, code: 'Numpad7' })), 'Control+7');
});

test('combos without Command/Control/Alt are rejected', () => {
  assert.strictEqual(eventToAccelerator(ev({ code: 'KeyV' })), null);
  assert.strictEqual(eventToAccelerator(ev({ shiftKey: true, code: 'KeyV' })), null);
});

test('modifier-only and unmappable presses are rejected', () => {
  assert.strictEqual(eventToAccelerator(ev({ metaKey: true, code: 'MetaLeft' })), null);
  assert.strictEqual(eventToAccelerator(ev({ metaKey: true, code: 'ShiftRight' })), null);
  assert.strictEqual(eventToAccelerator(ev({ metaKey: true, code: 'Escape' })), null);
});

test('keyFromCode distinguishes real keys from modifiers', () => {
  assert.strictEqual(keyFromCode('KeyQ'), 'Q');
  assert.strictEqual(keyFromCode('MetaLeft'), null);
  assert.strictEqual(keyFromCode('Escape'), null);
});

test('formatAccelerator renders mac symbols', () => {
  assert.strictEqual(formatAccelerator('CommandOrControl+Shift+V'), '⌘⇧V');
  assert.strictEqual(formatAccelerator('Command+Alt+Space'), '⌘⌥Space');
  assert.strictEqual(formatAccelerator('Control+Alt+Left'), '⌃⌥Left');
});

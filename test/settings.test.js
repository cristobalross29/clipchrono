const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSettings, DEFAULTS } = require('../src/main/settings');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'clipchrono-'));

test('returns defaults when no file exists', () => {
  const s = createSettings(tmp());
  assert.deepStrictEqual(s.get(), DEFAULTS);
});

test('set() patches, persists, and survives reload', () => {
  const dir = tmp();
  const s = createSettings(dir);
  s.set({ maxItems: 100 });
  const reloaded = createSettings(dir);
  assert.strictEqual(reloaded.get().maxItems, 100);
  assert.strictEqual(reloaded.get().hotkey, DEFAULTS.hotkey);
});

test('corrupt file falls back to defaults', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{not json');
  assert.deepStrictEqual(createSettings(dir).get(), DEFAULTS);
});

test('set() clamps maxItems and expireDays', () => {
  const s = createSettings(tmp());
  assert.strictEqual(s.set({ maxItems: 999999 }).maxItems, 5000);
  assert.strictEqual(s.set({ maxItems: 1 }).maxItems, 50);
  assert.strictEqual(s.set({ expireDays: -5 }).expireDays, 0);
  assert.strictEqual(s.set({ maxItems: 0 }).maxItems, 50);
  assert.strictEqual(s.set({ maxItems: 'abc' }).maxItems, 500);
});

test('invalid disk values are sanitized at load', () => {
  const dir = tmp();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ hotkey: 123, maxItems: 999999999, expireDays: 'x' }));
  const s = createSettings(dir);
  assert.strictEqual(s.get().hotkey, DEFAULTS.hotkey);
  assert.strictEqual(s.get().maxItems, 5000);
  assert.strictEqual(s.get().expireDays, 0);
});

test('defaults match spec', () => {
  assert.strictEqual(DEFAULTS.hotkey, 'CommandOrControl+Shift+V');
  assert.strictEqual(DEFAULTS.maxItems, 500);
  assert.strictEqual(DEFAULTS.expireDays, 0);
  assert.strictEqual(DEFAULTS.launchAtLogin, true);
  assert.strictEqual(DEFAULTS.onboarded, false);
});

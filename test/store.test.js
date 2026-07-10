const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/main/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pastport-'));
const PNG = Buffer.from('fakepng-full');
const THUMB = Buffer.from('fakepng-thumb');

test('addText inserts newest first and persists across reload', () => {
  const dir = tmp();
  const s = createStore(dir);
  s.addText('first');
  s.addText('second');
  assert.deepStrictEqual(s.list().map((i) => i.text), ['second', 'first']);
  assert.deepStrictEqual(createStore(dir).list().map((i) => i.text), ['second', 'first']);
});

test('duplicate text moves existing item to top instead of duplicating', () => {
  const s = createStore(tmp());
  s.addText('a');
  s.addText('b');
  s.addText('a');
  assert.deepStrictEqual(s.list().map((i) => i.text), ['a', 'b']);
  assert.strictEqual(s.list().length, 2);
});

test('empty/whitespace text is rejected', () => {
  const s = createStore(tmp());
  assert.strictEqual(s.addText('   '), null);
  assert.strictEqual(s.list().length, 0);
});

test('cap evicts oldest unpinned, never pinned', () => {
  const s = createStore(tmp(), { getMaxItems: () => 3 });
  const a = s.addText('a');
  s.setPinned(a.id, true);
  s.addText('b');
  s.addText('c');
  s.addText('d');
  const texts = s.list().map((i) => i.text);
  assert.ok(texts.includes('a'));
  assert.ok(!texts.includes('b'));
  assert.strictEqual(texts.length, 3);
});

test('addImage writes files; remove deletes them', () => {
  const dir = tmp();
  const s = createStore(dir);
  const item = s.addImage(PNG, THUMB);
  assert.ok(fs.existsSync(item.imagePath));
  assert.ok(fs.existsSync(item.thumbPath));
  s.remove([item.id]);
  assert.ok(!fs.existsSync(item.imagePath));
  assert.strictEqual(s.list().length, 0);
});

test('duplicate image dedupes by content hash', () => {
  const s = createStore(tmp());
  s.addImage(PNG, THUMB);
  s.addImage(PNG, THUMB);
  assert.strictEqual(s.list().length, 1);
});

test('clearAll keeps pinned items', () => {
  const s = createStore(tmp());
  const a = s.addText('keep');
  s.setPinned(a.id, true);
  s.addText('gone');
  s.clearAll();
  assert.deepStrictEqual(s.list().map((i) => i.text), ['keep']);
});

test('list puts pinned first; search filters text case-insensitively', () => {
  const s = createStore(tmp());
  s.addText('hello world');
  const b = s.addText('other');
  s.setPinned(b.id, true);
  s.addImage(PNG, THUMB);
  assert.strictEqual(s.list()[0].id, b.id);
  assert.deepStrictEqual(s.list('HELLO').map((i) => i.text), ['hello world']);
});

test('expire removes stale unpinned items only; 0 disables', () => {
  let t = 1_000_000_000_000;
  const s = createStore(tmp(), { now: () => t });
  const old = s.addText('old');
  const oldPinned = s.addText('old-pinned');
  s.setPinned(oldPinned.id, true);
  t += 31 * 86400000;
  s.addText('fresh');
  s.expire(0);
  assert.strictEqual(s.list().length, 3);
  s.expire(30);
  const texts = s.list().map((i) => i.text);
  assert.deepStrictEqual(new Set(texts), new Set(['fresh', 'old-pinned']));
  assert.ok(!texts.includes('old'));
});

test('touch moves item to front and bumps lastUsedAt', () => {
  let t = 1000;
  const s = createStore(tmp(), { now: () => t });
  const a = s.addText('a');
  t = 2000;
  s.addText('b');
  t = 3000;
  s.touch(a.id);
  assert.strictEqual(s.list()[0].id, a.id);
  assert.strictEqual(s.get(a.id).lastUsedAt, 3000);
});

test('corrupt history.json is renamed to .bak and store starts empty', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'history.json'), '{not valid json');
  const s = createStore(dir);
  assert.strictEqual(s.list().length, 0);
  assert.ok(fs.existsSync(path.join(dir, 'history.json.bak')));
  assert.strictEqual(fs.readFileSync(path.join(dir, 'history.json.bak'), 'utf8'), '{not valid json');
  s.addText('after-corruption');
  assert.deepStrictEqual(s.list().map((i) => i.text), ['after-corruption']);
});

test('valid-JSON-wrong-shape history.json is quarantined like corrupt JSON', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'history.json'), '{"not":"an array"}');
  const s = createStore(dir);
  assert.strictEqual(s.list().length, 0);
  assert.ok(fs.existsSync(path.join(dir, 'history.json.bak')));
});

test('texts differing only by invisible whitespace dedupe to one entry', () => {
  const s = createStore(tmp());
  const original = s.addText('Estoy probando de nueva aplicación.');
  s.addText(' Estoy probando de nueva aplicación.');
  s.addText('Estoy probando de nueva aplicación. ');
  assert.strictEqual(s.list().length, 1);
  assert.strictEqual(s.list()[0].id, original.id);
  assert.strictEqual(s.list()[0].text, 'Estoy probando de nueva aplicación.');
});

test('NFD and NFC forms of the same text dedupe to one entry', () => {
  const s = createStore(tmp());
  s.addText('aplicación');
  s.addText('aplicación');
  assert.strictEqual(s.list().length, 1);
});

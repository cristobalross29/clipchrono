const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/main/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'clipchrono-'));
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
  s.addText('\u00A0Estoy probando de nueva aplicación.');
  s.addText('Estoy probando de nueva aplicación. ');
  s.addText('Estoy probando de\u00A0nueva aplicación.');
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

test('addText stores kind for urls, code, and plain text', () => {
  const s = createStore(tmp());
  assert.strictEqual(s.addText('https://example.com').kind, 'url');
  assert.strictEqual(s.addText('const a = 1;\nconst b = 2;').kind, 'code');
  assert.strictEqual(s.addText('plain old text').kind, null);
});

test('legacy items without kind are classified once on load and persisted', () => {
  const dir = tmp();
  const legacy = [
    { id: '1', type: 'text', text: 'https://example.com', hash: 'h1', pinned: false, copiedAt: 1, lastUsedAt: 1 },
    { id: '2', type: 'text', text: 'plain', hash: 'h2', pinned: false, copiedAt: 2, lastUsedAt: 2 },
  ];
  fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify(legacy));
  const s = createStore(dir);
  assert.strictEqual(s.get('1').kind, 'url');
  assert.strictEqual(s.get('2').kind, null);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'));
  assert.strictEqual(onDisk.find((i) => i.id === '1').kind, 'url');
  assert.ok('kind' in onDisk.find((i) => i.id === '2'));
});

test('addFile stores paths, dedupes by path set, and re-copy touches', () => {
  let t = 1000;
  const s = createStore(tmp(), { now: () => t });
  const a = s.addFile(['/Users/x/report.pdf']);
  assert.strictEqual(a.type, 'file');
  t = 2000;
  s.addText('between');
  t = 3000;
  const again = s.addFile(['/Users/x/report.pdf']);
  assert.strictEqual(again.id, a.id);
  assert.strictEqual(s.list()[0].id, a.id);
  assert.strictEqual(s.addFile([]), null);
});

test('different path sets are different items; order and newlines do not confuse the hash', () => {
  const s = createStore(tmp());
  s.addFile(['/a.txt']);
  s.addFile(['/a.txt', '/b.txt']);
  assert.strictEqual(s.list().length, 2);
  s.addFile(['/b.txt', '/a.txt']);
  assert.strictEqual(s.list().length, 2);
  s.addFile(['/a.txt\n/b.txt']);
  assert.strictEqual(s.list().length, 3);
});

test('search matches file items by path, case-insensitively', () => {
  const s = createStore(tmp());
  s.addFile(['/Users/x/Report-Final.PDF']);
  s.addText('unrelated');
  assert.strictEqual(s.list('report-final').length, 1);
  assert.strictEqual(s.list('report-final')[0].type, 'file');
});

test('file items persist across reload', () => {
  const dir = tmp();
  createStore(dir).addFile(['/a.txt']);
  assert.deepStrictEqual(createStore(dir).list()[0].paths, ['/a.txt']);
});

test('merge dedupes by recomputed content hash, ignoring supplied hashes', () => {
  const dir = tmp();
  const s = createStore(dir);
  s.addText('shared');
  const r = s.merge({
    items: [
      { id: 'i1', type: 'text', text: 'shared', kind: null, hash: 'lying-hash', pinned: false, copiedAt: 1, lastUsedAt: 1 },
      { id: 'i2', type: 'text', text: 'new one', kind: null, hash: 'whatever', pinned: false, copiedAt: 2, lastUsedAt: 2 },
      { id: 'i3', type: 'text', text: 'new one', kind: null, hash: 'different-lie', pinned: false, copiedAt: 3, lastUsedAt: 3 },
    ],
    folders: [],
  }, path.join(dir, 'nope'));
  assert.strictEqual(r.added, 1);
  assert.strictEqual(s.list().length, 2);
});

test('merge assigns fresh ids and classifies imported text lacking kind', () => {
  const dir = tmp();
  const s = createStore(dir);
  s.merge({
    items: [{ id: '../../evil', type: 'text', text: 'https://example.com', hash: 'x', pinned: false, copiedAt: 1, lastUsedAt: 1 }],
    folders: [],
  }, path.join(dir, 'nope'));
  const item = s.list()[0];
  assert.notStrictEqual(item.id, '../../evil');
  assert.match(item.id, /^[0-9a-f-]{36}$/);
  assert.strictEqual(item.kind, 'url');
});

test('merge normalizes non-finite timestamps', () => {
  const s = createStore(tmp(), { now: () => 5000 });
  s.merge({
    items: [{ id: 'a', type: 'text', text: 'x', hash: 'h', pinned: false, copiedAt: 'soon', lastUsedAt: null }],
    folders: [],
  }, '/nonexistent');
  assert.strictEqual(s.list()[0].copiedAt, 5000);
  assert.strictEqual(s.list()[0].lastUsedAt, 5000);
});

test('merge skips image whose source is a symlink escaping the staging dir', () => {
  const dir = tmp();
  const srcImages = tmp();
  const outside = path.join(tmp(), 'secret.png');
  fs.writeFileSync(outside, PNG);
  fs.symlinkSync(outside, path.join(srcImages, 'sneaky.png'));
  fs.writeFileSync(path.join(srcImages, 'sneaky.thumb.png'), THUMB);
  const s = createStore(dir);
  const r = s.merge({
    items: [{ id: 'sneaky', type: 'image', imagePath: '/x/sneaky.png', thumbPath: '/x/sneaky.thumb.png', hash: 'h', pinned: false, copiedAt: 1, lastUsedAt: 1 }],
    folders: [],
  }, srcImages);
  assert.strictEqual(r.added, 0);
});

test('merge maps folders by name and creates unknown ones', () => {
  const dir = tmp();
  const s = createStore(dir);
  const local = s.createFolder('CLI');
  s.merge({
    items: [
      { id: 'a', type: 'text', text: 'x', kind: null, hash: 'hx', pinned: false, copiedAt: 1, lastUsedAt: 1, folderId: 'f-remote-cli' },
      { id: 'b', type: 'text', text: 'y', kind: null, hash: 'hy', pinned: false, copiedAt: 1, lastUsedAt: 1, folderId: 'f-remote-new' },
    ],
    folders: [
      { id: 'f-remote-cli', name: 'cli', createdAt: 1 },
      { id: 'f-remote-new', name: 'Snippets', createdAt: 1 },
    ],
  }, path.join(dir, 'nope'));
  assert.strictEqual(s.listFolders().length, 2);
  assert.strictEqual(s.list('', local.id).length, 1);
  const snip = s.listFolders().find((f) => f.name === 'Snippets');
  assert.strictEqual(s.list('', snip.id).length, 1);
});

test('merge copies image files in and rewrites paths; skips images with missing files', () => {
  const dir = tmp();
  const srcImages = tmp();
  fs.writeFileSync(path.join(srcImages, 'old-id.png'), PNG);
  fs.writeFileSync(path.join(srcImages, 'old-id.thumb.png'), THUMB);
  const s = createStore(dir);
  const r = s.merge({
    items: [
      { id: 'old-id', type: 'image', imagePath: '/other/mac/old-id.png', thumbPath: '/other/mac/old-id.thumb.png', hash: 'himg', pinned: false, copiedAt: 1, lastUsedAt: 1 },
      { id: 'gone', type: 'image', imagePath: '/other/mac/gone.png', thumbPath: '/other/mac/gone.thumb.png', hash: 'hgone', pinned: false, copiedAt: 1, lastUsedAt: 1 },
    ],
    folders: [],
  }, srcImages);
  assert.strictEqual(r.added, 1);
  const img = s.list()[0];
  assert.ok(img.imagePath.startsWith(path.join(dir, 'images')));
  assert.ok(fs.existsSync(img.imagePath));
  assert.ok(fs.existsSync(img.thumbPath));
});

test('merge sorts by lastUsedAt, enforces the cap, and reports kept separately from added', () => {
  const s = createStore(tmp(), { getMaxItems: () => 2, now: () => 100 });
  s.addText('local'); // lastUsedAt 100
  const r = s.merge({
    items: [
      { id: 'n1', type: 'text', text: 'newest', kind: null, hash: 'h1', pinned: false, copiedAt: 300, lastUsedAt: 300 },
      { id: 'n2', type: 'text', text: 'oldest', kind: null, hash: 'h2', pinned: false, copiedAt: 1, lastUsedAt: 1 },
    ],
    folders: [],
  }, '/nonexistent');
  const texts = s.list().map((i) => i.text);
  assert.deepStrictEqual(texts, ['newest', 'local']);
  assert.strictEqual(r.added, 2);
  assert.strictEqual(r.kept, 1);
});

test('merge skips malformed items and persists once at the end', () => {
  const dir = tmp();
  const s = createStore(dir);
  const r = s.merge({
    items: [
      null,
      { type: 'text' },
      { id: 'ok', type: 'file', paths: ['/a.txt'], hash: 'hf', pinned: false, copiedAt: 1, lastUsedAt: 1 },
      { id: 'bad', type: 'wat', hash: 'hw' },
    ],
    folders: [null, { id: 'x' }],
  }, '/nonexistent');
  assert.strictEqual(r.added, 1);
  assert.deepStrictEqual(createStore(dir).list()[0].paths, ['/a.txt']);
});

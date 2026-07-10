const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/main/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'clipchrono-'));
const PNG = Buffer.from('fakepng-full');
const THUMB = Buffer.from('fakepng-thumb');

test('createFolder trims, rejects empty and case-insensitive duplicates', () => {
  const s = createStore(tmp());
  const f = s.createFolder('  CLI  ');
  assert.strictEqual(f.name, 'CLI');
  assert.strictEqual(s.createFolder(''), null);
  assert.strictEqual(s.createFolder('   '), null);
  assert.strictEqual(s.createFolder('cli'), null);
});

test('listFolders is alphabetical case-insensitively and persists across reload', () => {
  const dir = tmp();
  const s = createStore(dir);
  s.createFolder('beta');
  s.createFolder('Alpha');
  assert.deepStrictEqual(s.listFolders().map((f) => f.name), ['Alpha', 'beta']);
  assert.deepStrictEqual(createStore(dir).listFolders().map((f) => f.name), ['Alpha', 'beta']);
});

test('renameFolder validates like create and allows renaming to same name', () => {
  const s = createStore(tmp());
  const a = s.createFolder('a');
  s.createFolder('b');
  assert.strictEqual(s.renameFolder(a.id, 'b'), null);
  assert.strictEqual(s.renameFolder(a.id, ''), null);
  assert.strictEqual(s.renameFolder(a.id, 'a').name, 'a');
  assert.strictEqual(s.renameFolder(a.id, 'c').name, 'c');
  assert.strictEqual(s.renameFolder('nope', 'x'), null);
});

test('setItemFolder moves items in and out and validates the target', () => {
  const s = createStore(tmp());
  const f = s.createFolder('CLI');
  const item = s.addText('ssh box');
  s.setItemFolder(item.id, f.id);
  assert.strictEqual(s.get(item.id).folderId, f.id);
  s.setItemFolder(item.id, 'unknown-folder');
  assert.strictEqual(s.get(item.id).folderId, f.id);
  s.setItemFolder(item.id, null);
  assert.strictEqual(s.get(item.id).folderId, undefined);
});

test('list scopes to a place: stream excludes foldered, folder shows only its items', () => {
  const s = createStore(tmp());
  const f = s.createFolder('CLI');
  const a = s.addText('in folder');
  s.addText('in stream');
  s.setItemFolder(a.id, f.id);
  assert.deepStrictEqual(s.list().map((i) => i.text), ['in stream']);
  assert.deepStrictEqual(s.list('', f.id).map((i) => i.text), ['in folder']);
  assert.deepStrictEqual(s.list('folder', f.id).map((i) => i.text), ['in folder']);
  assert.deepStrictEqual(s.list('stream', f.id), []);
  assert.deepStrictEqual(s.list('', 'deleted-folder'), []);
});

test('cap eviction, expire, and clearAll all skip foldered items', () => {
  let t = 1_000_000_000_000;
  const s = createStore(tmp(), { getMaxItems: () => 3, now: () => t });
  const f = s.createFolder('keep');
  const a = s.addText('folded');
  s.setItemFolder(a.id, f.id);
  s.addText('b');
  s.addText('c');
  s.addText('d');
  assert.ok(s.list('', f.id).length === 1);
  t += 31 * 86400000;
  s.expire(30);
  assert.strictEqual(s.list('', f.id).length, 1);
  s.clearAll();
  assert.strictEqual(s.list('', f.id).length, 1);
  assert.strictEqual(s.list().length, 0);
});

test('deleteFolder removes the folder, its items, and their image files', () => {
  const s = createStore(tmp());
  const f = s.createFolder('imgs');
  const img = s.addImage(PNG, THUMB);
  s.setItemFolder(img.id, f.id);
  const keep = s.addText('stays');
  s.deleteFolder(f.id);
  assert.deepStrictEqual(s.listFolders(), []);
  assert.strictEqual(s.get(img.id), undefined);
  assert.ok(!fs.existsSync(img.imagePath));
  assert.ok(!fs.existsSync(img.thumbPath));
  assert.ok(s.get(keep.id));
});

test('cap counts only stream items: a large folder library never evicts the stream', () => {
  const s = createStore(tmp(), { getMaxItems: () => 2 });
  const f = s.createFolder('big');
  for (let i = 0; i < 5; i++) {
    const item = s.addText('snippet ' + i);
    s.setItemFolder(item.id, f.id);
  }
  s.addText('stream-1');
  s.addText('stream-2');
  assert.deepStrictEqual(s.list().map((i) => i.text), ['stream-2', 'stream-1']);
  assert.strictEqual(s.list('', f.id).length, 5);
});

test('moving a clip back to a full stream re-applies the cap', () => {
  const s = createStore(tmp(), { getMaxItems: () => 2 });
  const f = s.createFolder('hold');
  const held = s.addText('held');
  s.setItemFolder(held.id, f.id);
  s.addText('a');
  s.addText('b');
  s.setItemFolder(held.id, null);
  assert.strictEqual(s.list().length, 2);
  assert.ok(s.get(held.id));
});

test('malformed folder entries are dropped on load; orphaned folderIds return clips to the stream', () => {
  const dir = tmp();
  const s1 = createStore(dir);
  const item = s1.addText('orphan-me');
  const f = s1.createFolder('doomed');
  s1.setItemFolder(item.id, f.id);
  fs.writeFileSync(path.join(dir, 'folders.json'), JSON.stringify([{ bogus: true }, 42]));
  const s2 = createStore(dir);
  assert.deepStrictEqual(s2.listFolders(), []);
  assert.deepStrictEqual(s2.list().map((i) => i.text), ['orphan-me']);
});

test('corrupt or wrong-shape folders.json is quarantined to .bak', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'folders.json'), '{"not":"an array"}');
  const s = createStore(dir);
  assert.deepStrictEqual(s.listFolders(), []);
  assert.ok(fs.existsSync(path.join(dir, 'folders.json.bak')));
  s.createFolder('fresh');
  assert.strictEqual(createStore(dir).listFolders().length, 1);
});

test('setItemFolder is a strict no-op when the item is already in that place', () => {
  const s = createStore(tmp(), { getMaxItems: () => 2 });
  s.addText('old');
  const top = s.addText('top');
  s.setItemFolder(s.list()[1].id, null);
  assert.deepStrictEqual(s.list().map((i) => i.text), ['top', 'old']);
  const f = s.createFolder('f');
  s.setItemFolder(top.id, f.id);
  s.setItemFolder(top.id, f.id);
  assert.strictEqual(s.list('', f.id).length, 1);
});

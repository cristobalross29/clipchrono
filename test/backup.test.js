const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/main/store');
const { exportBackup, importBackup } = require('../src/main/backup');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'clipchrono-'));
const PNG = Buffer.from('fakepng-full');
const THUMB = Buffer.from('fakepng-thumb');

function rawZip(names) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const n = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30 + n.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt16LE(n.length, 26);
    n.copy(local, 30);
    const central = Buffer.alloc(46 + n.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    n.copy(central, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function rawZipBomb(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, uncompressedSize } of entries) {
    const n = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30 + n.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(uncompressedSize >>> 0, 22);
    local.writeUInt16LE(n.length, 26);
    n.copy(local, 30);
    const central = Buffer.alloc(46 + n.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(uncompressedSize >>> 0, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    n.copy(central, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test('zip declaring a decompression-bomb uncompressed size is rejected before extraction', () => {
  const zip = path.join(tmp(), 'bomb.zip');
  // declared size only, no actual data written — proves the preflight reads header
  // metadata rather than extracting, so a tiny file can't claim to expand past the cap
  fs.writeFileSync(zip, rawZipBomb([{ name: 'meta.json', uncompressedSize: 3 * 1024 * 1024 * 1024 }]));
  const dst = createStore(tmp());
  dst.addText('precious');
  assert.throws(() => importBackup({ zipPath: zip, tmpRoot: tmp(), store: dst }), /NOT_A_BACKUP/);
  assert.strictEqual(dst.list().length, 1);
});

test('zip with meta.json but no history.json is rejected', () => {
  const stage = tmp();
  fs.writeFileSync(path.join(stage, 'meta.json'), JSON.stringify({ app: 'clipchrono', formatVersion: 1 }));
  const zip = path.join(tmp(), 'nohistory.zip');
  require('node:child_process').execFileSync('/usr/bin/ditto', ['-c', '-k', stage, zip]);
  assert.throws(() => importBackup({ zipPath: zip, tmpRoot: tmp(), store: createStore(tmp()) }), /NOT_A_BACKUP/);
});

test('export then import into an empty store restores everything', () => {
  const srcDir = tmp();
  const src = createStore(srcDir);
  src.addText('https://example.com');
  src.addText('plain note');
  src.addImage(PNG, THUMB);
  src.addFile(['/Users/x/gone.pdf']);
  const f = src.createFolder('CLI');
  const item = src.addText('foldered');
  src.setItemFolder(item.id, f.id);

  const zip = path.join(tmp(), 'backup.zip');
  exportBackup({ dataDir: srcDir, destZip: zip, tmpRoot: tmp() });
  assert.ok(fs.existsSync(zip));

  const dstDir = tmp();
  const dst = createStore(dstDir);
  const r = importBackup({ zipPath: zip, tmpRoot: tmp(), store: dst });
  assert.strictEqual(r.added, 5);
  assert.strictEqual(dst.listFolders().length, 1);
  const img = dst.list().find((i) => i.type === 'image');
  assert.ok(img.imagePath.startsWith(path.join(dstDir, 'images')));
  assert.deepStrictEqual(fs.readFileSync(img.imagePath), PNG);
  assert.strictEqual(dst.list().find((i) => i.type === 'text' && i.text === 'https://example.com').kind, 'url');
});

test('importing the same backup twice adds nothing the second time', () => {
  const srcDir = tmp();
  const src = createStore(srcDir);
  src.addText('once');
  const zip = path.join(tmp(), 'b.zip');
  exportBackup({ dataDir: srcDir, destZip: zip, tmpRoot: tmp() });
  const dst = createStore(tmp());
  importBackup({ zipPath: zip, tmpRoot: tmp(), store: dst });
  const r2 = importBackup({ zipPath: zip, tmpRoot: tmp(), store: dst });
  assert.strictEqual(r2.added, 0);
  assert.strictEqual(dst.list().length, 1);
});

test('garbage file is rejected as NOT_A_BACKUP and store is untouched', () => {
  const bad = path.join(tmp(), 'bad.zip');
  fs.writeFileSync(bad, 'this is not a zip');
  const dst = createStore(tmp());
  dst.addText('precious');
  assert.throws(() => importBackup({ zipPath: bad, tmpRoot: tmp(), store: dst }), /NOT_A_BACKUP/);
  assert.strictEqual(dst.list().length, 1);
});

test('zip without meta.json is rejected', () => {
  const stage = tmp();
  fs.writeFileSync(path.join(stage, 'history.json'), '[]');
  const zip = path.join(tmp(), 'nometa.zip');
  require('node:child_process').execFileSync('/usr/bin/ditto', ['-c', '-k', stage, zip]);
  assert.throws(() => importBackup({ zipPath: zip, tmpRoot: tmp(), store: createStore(tmp()) }), /NOT_A_BACKUP/);
});

test('zip with wrong app or version in meta.json is rejected', () => {
  const stage = tmp();
  fs.writeFileSync(path.join(stage, 'meta.json'), JSON.stringify({ app: 'other', formatVersion: 1 }));
  const zip = path.join(tmp(), 'wrongapp.zip');
  require('node:child_process').execFileSync('/usr/bin/ditto', ['-c', '-k', stage, zip]);
  assert.throws(() => importBackup({ zipPath: zip, tmpRoot: tmp(), store: createStore(tmp()) }), /NOT_A_BACKUP/);
});

test('export includes only referenced images, not strays in images/', () => {
  const srcDir = tmp();
  const src = createStore(srcDir);
  src.addImage(PNG, THUMB);
  fs.writeFileSync(path.join(srcDir, 'images', 'stray-orphan.png'), Buffer.from('orphan'));
  const zip = path.join(tmp(), 'refs.zip');
  exportBackup({ dataDir: srcDir, destZip: zip, tmpRoot: tmp() });
  const listing = require('node:child_process').execFileSync('/usr/bin/zipinfo', ['-1', zip]).toString('utf8');
  assert.ok(!listing.includes('stray-orphan.png'));
  assert.ok(listing.includes('.thumb.png'));
});

test('export of an empty store still produces an importable backup', () => {
  const zip = path.join(tmp(), 'empty.zip');
  exportBackup({ dataDir: tmp(), destZip: zip, tmpRoot: tmp() });
  const r = importBackup({ zipPath: zip, tmpRoot: tmp(), store: createStore(tmp()) });
  assert.strictEqual(r.added, 0);
});

test('zip entries with traversal or absolute names are rejected', () => {
  const dst = createStore(tmp());
  dst.addText('precious');
  for (const names of [['../evil.txt'], ['images/../../evil.png'], ['/abs.txt']]) {
    const zip = path.join(tmp(), 'hostile.zip');
    fs.writeFileSync(zip, rawZip(names));
    assert.throws(() => importBackup({ zipPath: zip, tmpRoot: tmp(), store: dst }), /NOT_A_BACKUP/);
  }
  assert.strictEqual(dst.list().length, 1);
});

test('zip with more than 5000 entries is rejected', () => {
  const zip = path.join(tmp(), 'many.zip');
  fs.writeFileSync(zip, rawZip(Array.from({ length: 5001 }, (_, i) => `f${i}.txt`)));
  assert.throws(() => importBackup({ zipPath: zip, tmpRoot: tmp(), store: createStore(tmp()) }), /NOT_A_BACKUP/);
});

test('oversized zip file is rejected before any reads', () => {
  const zip = path.join(tmp(), 'huge.zip');
  const fd = fs.openSync(zip, 'w');
  fs.ftruncateSync(fd, 1024 * 1024 * 1024 + 1);
  fs.closeSync(fd);
  assert.throws(() => importBackup({ zipPath: zip, tmpRoot: tmp(), store: createStore(tmp()) }), /NOT_A_BACKUP/);
});

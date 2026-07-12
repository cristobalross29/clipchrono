const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DITTO = '/usr/bin/ditto';
const ZIPINFO = '/usr/bin/zipinfo';
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
const MAX_JSON_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;

function exportBackup({ dataDir, destZip, tmpRoot, exportedAt = Date.now() }) {
  const staging = fs.mkdtempSync(path.join(tmpRoot, 'clipchrono-export-'));
  const tmpZip = staging + '.zip';
  const destTmp = path.join(path.dirname(destZip), '.' + path.basename(destZip) + '.tmp');
  try {
    let items = [];
    const historyPath = path.join(dataDir, 'history.json');
    if (fs.existsSync(historyPath)) {
      const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('history.json is corrupt: not an array');
      items = parsed;
    }
    fs.writeFileSync(path.join(staging, 'history.json'), JSON.stringify(items));
    try { fs.copyFileSync(path.join(dataDir, 'folders.json'), path.join(staging, 'folders.json')); } catch {}
    const stagingImages = path.join(staging, 'images');
    if (items.some((i) => i && i.type === 'image')) fs.mkdirSync(stagingImages, { recursive: true });
    for (const i of items) {
      if (!i || i.type !== 'image') continue;
      for (const p of [i.imagePath, i.thumbPath]) {
        try { fs.copyFileSync(p, path.join(stagingImages, path.basename(p))); } catch {}
      }
    }
    fs.writeFileSync(path.join(staging, 'meta.json'), JSON.stringify({ app: 'clipchrono', formatVersion: 1, exportedAt }));
    execFileSync(DITTO, ['-c', '-k', staging, tmpZip], { stdio: 'pipe' });
    fs.copyFileSync(tmpZip, destTmp);
    fs.renameSync(destTmp, destZip); // same-directory rename: atomic, no cross-volume partial writes
  } catch (err) {
    try { fs.unlinkSync(destTmp); } catch {}
    throw err;
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(tmpZip, { force: true }); } catch {}
  }
}

function importBackup({ zipPath, tmpRoot, store }) {
  let size;
  try { size = fs.statSync(zipPath).size; } catch { throw new Error('NOT_A_BACKUP'); }
  if (!size || size > MAX_ZIP_BYTES) throw new Error('NOT_A_BACKUP');
  let names;
  try {
    names = execFileSync(ZIPINFO, ['-1', zipPath], { stdio: 'pipe' }).toString('utf8').split('\n').filter(Boolean);
  } catch {
    throw new Error('NOT_A_BACKUP');
  }
  if (names.length > MAX_ENTRIES || names.some((n) => n.startsWith('/') || n.split('/').includes('..'))) {
    throw new Error('NOT_A_BACKUP');
  }
  let totalUncompressed;
  try {
    const listing = execFileSync(ZIPINFO, [zipPath], { stdio: 'pipe' }).toString('utf8');
    const lines = listing.trim().split('\n');
    const summary = lines[lines.length - 1];
    const m = summary.match(/^\d+\s+files?,\s+(\d+)\s+bytes uncompressed/);
    if (!m) throw new Error('unparseable zipinfo summary');
    totalUncompressed = Number(m[1]);
  } catch {
    throw new Error('NOT_A_BACKUP');
  }
  if (!Number.isFinite(totalUncompressed) || totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
    throw new Error('NOT_A_BACKUP');
  }
  const staging = fs.mkdtempSync(path.join(tmpRoot, 'clipchrono-import-'));
  try {
    try {
      execFileSync(DITTO, ['-x', '-k', zipPath, staging], { stdio: 'pipe' });
    } catch (err) {
      throw new Error('EXTRACT_FAILED: ' + String(err.message || err).slice(0, 200));
    }
    const readJson = (name, required) => {
      const p = path.join(staging, name);
      let stat;
      try { stat = fs.lstatSync(p); } catch {
        if (required) throw new Error('NOT_A_BACKUP');
        return null;
      }
      if (!stat.isFile() || stat.size > MAX_JSON_BYTES) throw new Error('NOT_A_BACKUP');
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { throw new Error('NOT_A_BACKUP'); }
    };
    const meta = readJson('meta.json', true);
    if (!meta || typeof meta !== 'object' || Array.isArray(meta) || meta.app !== 'clipchrono' || meta.formatVersion !== 1) {
      throw new Error('NOT_A_BACKUP');
    }
    const history = readJson('history.json', true);
    if (!Array.isArray(history)) throw new Error('NOT_A_BACKUP');
    const arr = (v) => (Array.isArray(v) ? v : []);
    return store.merge(
      { items: history, folders: arr(readJson('folders.json')) },
      path.join(staging, 'images'),
    );
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { exportBackup, importBackup };

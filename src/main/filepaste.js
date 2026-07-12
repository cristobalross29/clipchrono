const { execFileSync } = require('node:child_process');

const PLUTIL = '/usr/bin/plutil';
const MAX_PLIST_BYTES = 4_000_000;

function parseFilenamesPlist(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length || buf.length > MAX_PLIST_BYTES) return null;
  let json;
  try {
    json = execFileSync(PLUTIL, ['-convert', 'json', '-o', '-', '-'], { input: buf, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  } catch {
    return null;
  }
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr) || !arr.length) return null;
    if (!arr.every((p) => typeof p === 'string' && p.startsWith('/'))) return null;
    return arr;
  } catch {
    return null;
  }
}

function buildFilenamesPlist(paths) {
  return execFileSync(PLUTIL, ['-convert', 'xml1', '-o', '-', '-'], { input: JSON.stringify(paths), stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
}

function fileUrlToPath(url) {
  return decodeURIComponent(new URL(url).pathname);
}

module.exports = { parseFilenamesPlist, buildFilenamesPlist, fileUrlToPath };

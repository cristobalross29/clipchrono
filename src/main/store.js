const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha1 = require('./hash');

const normalizeForHash = (text) =>
  text.normalize('NFC').replace(/[\u00A0\u202F\u2007]/g, ' ').trim();

function createStore(dir, { getMaxItems = () => 500, now = Date.now } = {}) {
  const file = path.join(dir, 'history.json');
  const imagesDir = path.join(dir, 'images');
  let items;
  try {
    items = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(items)) throw new Error('history.json is not an array');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      try { fs.renameSync(file, file + '.bak'); } catch {}
    }
    items = [];
  }

  function persist() {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(items));
    fs.renameSync(tmp, file);
  }

  function removeFiles(item) {
    for (const p of [item.imagePath, item.thumbPath]) {
      if (p) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }

  function enforceCap() {
    const max = getMaxItems();
    while (items.length > max) {
      let idx = -1;
      for (let i = items.length - 1; i >= 0; i--) {
        if (!items[i].pinned) { idx = i; break; }
      }
      if (idx === -1) break;
      removeFiles(items[idx]);
      items.splice(idx, 1);
    }
  }

  function get(id) {
    return items.find((i) => i.id === id);
  }

  function touch(id) {
    const item = get(id);
    if (!item) return undefined;
    item.lastUsedAt = now();
    items = [item, ...items.filter((i) => i.id !== id)];
    persist();
    return item;
  }

  function insert(item) {
    items.unshift(item);
    enforceCap();
    persist();
    return item;
  }

  function addText(text) {
    if (!text || !text.trim()) return null;
    const hash = sha1('text:' + normalizeForHash(text));
    const existing = items.find((i) => i.hash === hash);
    if (existing) return touch(existing.id);
    const t = now();
    return insert({ id: crypto.randomUUID(), type: 'text', text, hash, pinned: false, copiedAt: t, lastUsedAt: t });
  }

  function addImage(pngBuffer, thumbBuffer) {
    const hash = sha1(pngBuffer);
    const existing = items.find((i) => i.hash === hash);
    if (existing) return touch(existing.id);
    fs.mkdirSync(imagesDir, { recursive: true });
    const id = crypto.randomUUID();
    const imagePath = path.join(imagesDir, id + '.png');
    const thumbPath = path.join(imagesDir, id + '.thumb.png');
    fs.writeFileSync(imagePath, pngBuffer);
    fs.writeFileSync(thumbPath, thumbBuffer);
    const t = now();
    return insert({ id, type: 'image', imagePath, thumbPath, hash, pinned: false, copiedAt: t, lastUsedAt: t });
  }

  function list(query = '') {
    const q = query.trim().toLowerCase();
    let result = items;
    if (q) result = items.filter((i) => i.type === 'text' && i.text.toLowerCase().includes(q));
    return [...result.filter((i) => i.pinned), ...result.filter((i) => !i.pinned)];
  }

  function remove(ids) {
    const set = new Set(ids);
    for (const item of items) if (set.has(item.id)) removeFiles(item);
    items = items.filter((i) => !set.has(i.id));
    persist();
  }

  function clearAll() {
    for (const item of items) if (!item.pinned) removeFiles(item);
    items = items.filter((i) => i.pinned);
    persist();
  }

  function setPinned(id, pinned) {
    const item = get(id);
    if (!item) return;
    item.pinned = pinned;
    persist();
  }

  function expire(days) {
    if (!days || days <= 0) return;
    const cutoff = now() - days * 86400000;
    const stale = items.filter((i) => !i.pinned && i.lastUsedAt < cutoff);
    if (stale.length) remove(stale.map((i) => i.id));
  }

  return { addText, addImage, list, get, touch, remove, clearAll, setPinned, expire };
}

module.exports = { createStore };

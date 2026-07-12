const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha1 = require('./hash');
const { classifyText } = require('./classify');

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

  const foldersFile = path.join(dir, 'folders.json');
  let folders;
  try {
    folders = JSON.parse(fs.readFileSync(foldersFile, 'utf8'));
    if (!Array.isArray(folders)) throw new Error('folders.json is not an array');
    folders = folders.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string' && f.name.trim());
  } catch (err) {
    if (err.code !== 'ENOENT') {
      try { fs.renameSync(foldersFile, foldersFile + '.bak'); } catch {}
    }
    folders = [];
  }

  // reconcile orphans: a folderId pointing at no folder would make the clip invisible everywhere
  {
    const known = new Set(folders.map((f) => f.id));
    let orphaned = false;
    for (const item of items) {
      if (item.folderId && !known.has(item.folderId)) {
        delete item.folderId;
        orphaned = true;
      }
    }
    if (orphaned) persist();
  }

  {
    let classified = false;
    for (const item of items) {
      if (item.type === 'text' && !('kind' in item)) {
        item.kind = classifyText(item.text);
        classified = true;
      }
    }
    if (classified) persist();
  }

  function persistFolders() {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = foldersFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(folders));
    fs.renameSync(tmp, foldersFile);
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
    let streamCount = items.reduce((n, i) => n + (i.folderId ? 0 : 1), 0);
    if (streamCount <= max) return;
    for (let i = items.length - 1; i >= 0 && streamCount > max; i--) {
      if (!items[i].pinned && !items[i].folderId) {
        removeFiles(items[i]);
        items.splice(i, 1);
        streamCount--;
      }
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
    return insert({ id: crypto.randomUUID(), type: 'text', text, kind: classifyText(text), hash, pinned: false, copiedAt: t, lastUsedAt: t });
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

  function list(query = '', folderId = null) {
    const q = query.trim().toLowerCase();
    let result = items.filter((i) => (folderId == null ? !i.folderId : i.folderId === folderId));
    if (q) result = result.filter((i) => i.type === 'text' && i.text.toLowerCase().includes(q));
    return [...result.filter((i) => i.pinned), ...result.filter((i) => !i.pinned)];
  }

  function remove(ids) {
    const set = new Set(ids);
    for (const item of items) if (set.has(item.id)) removeFiles(item);
    items = items.filter((i) => !set.has(i.id));
    persist();
  }

  function clearAll() {
    for (const item of items) if (!item.pinned && !item.folderId) removeFiles(item);
    items = items.filter((i) => i.pinned || i.folderId);
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
    const stale = items.filter((i) => !i.pinned && !i.folderId && i.lastUsedAt < cutoff);
    if (stale.length) remove(stale.map((i) => i.id));
  }

  function findFolderByName(name) {
    const n = name.trim().toLowerCase();
    return folders.find((f) => f.name.toLowerCase() === n);
  }

  function listFolders() {
    return [...folders].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  function createFolder(name) {
    const trimmed = (name || '').trim();
    if (!trimmed || findFolderByName(trimmed)) return null;
    const folder = { id: crypto.randomUUID(), name: trimmed, createdAt: now() };
    folders.push(folder);
    persistFolders();
    return folder;
  }

  function renameFolder(id, name) {
    const folder = folders.find((f) => f.id === id);
    const trimmed = (name || '').trim();
    if (!folder || !trimmed) return null;
    const clash = findFolderByName(trimmed);
    if (clash && clash.id !== id) return null;
    folder.name = trimmed;
    persistFolders();
    return folder;
  }

  function deleteFolder(id) {
    if (!folders.some((f) => f.id === id)) return;
    for (const item of items) if (item.folderId === id) removeFiles(item);
    items = items.filter((i) => i.folderId !== id);
    folders = folders.filter((f) => f.id !== id);
    persist();
    persistFolders();
  }

  function setItemFolder(itemId, folderId) {
    const item = get(itemId);
    if (!item) return;
    if ((item.folderId ?? null) === (folderId ?? null)) return; // no-op move must not reorder or re-cap
    if (folderId != null && !folders.some((f) => f.id === folderId)) return;
    if (folderId == null) {
      delete item.folderId;
      items = [item, ...items.filter((i) => i.id !== itemId)];
      enforceCap(); // the clip re-enters the stream, which may already be at the cap
    } else {
      item.folderId = folderId;
    }
    persist();
  }

  return { addText, addImage, list, get, touch, remove, clearAll, setPinned, expire, listFolders, createFolder, renameFolder, deleteFolder, setItemFolder };
}

module.exports = { createStore };

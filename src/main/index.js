const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, clipboard, screen, systemPreferences, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createSettings, DEFAULTS } = require('./settings');
const { createStore } = require('./store');
const { createWatcher } = require('./watcher');
const launchagent = require('./launchagent');
const { sendPasteKeystroke } = require('./paster');
const { parseFilenamesPlist, buildFilenamesPlist, fileUrlToPath } = require('./filepaste');
const { exportBackup, importBackup } = require('./backup');

app.setName('ClipChrono');
if (!app.requestSingleInstanceLock()) app.quit();

const dataDir = () => app.getPath('userData');
let settings, store, watcher, tray, panel, welcome;
let dialogOpen = false;

const PANEL_W = 360;
const PANEL_H = 480;

const clipboardAdapter = {
  readText: () => {
    const t = clipboard.readText();
    return t.length > 10_000_000 ? '' : t;
  },
  readImagePng: () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    if (width * height > 25_000_000) return null; // re-encoding giant images every poll would spike CPU
    return img.toPNG();
  },
  hasConcealed: () => {
    try { return clipboard.has('org.nspasteboard.ConcealedType'); } catch { return false; }
  },
  lastFileBuf: null,
  lastFileResult: null,
  readFilePaths() {
    try {
      const buf = clipboard.readBuffer('NSFilenamesPboardType');
      if (buf && buf.length) {
        if (this.lastFileBuf && buf.equals(this.lastFileBuf)) {
          if (this.lastFileResult) return this.lastFileResult;
        } else {
          this.lastFileBuf = buf;
          this.lastFileResult = parseFilenamesPlist(buf);
          if (this.lastFileResult) return this.lastFileResult;
        }
      } else {
        this.lastFileBuf = null;
        this.lastFileResult = null;
      }
    } catch {}
    try {
      const url = clipboard.read('public.file-url');
      if (url) return [fileUrlToPath(url)];
    } catch {}
    return null;
  },
};

function makeThumb(pngBuffer) {
  return nativeImage.createFromBuffer(pngBuffer).resize({ height: 96 }).toPNG();
}

const toView = (i) => ({
  id: i.id,
  type: i.type,
  pinned: i.pinned,
  folderId: i.folderId || null,
  copiedAt: i.copiedAt,
  kind: i.kind || null,
  preview: i.type === 'text' ? i.text.slice(0, 300) : null,
  thumbUrl: i.type === 'image' ? pathToFileURL(i.thumbPath).href : null,
  ...(i.type === 'file'
    ? Array.isArray(i.paths) && i.paths.length
      ? {
          fileName: path.basename(i.paths[0]),
          fileDir: path.dirname(i.paths[0]),
          fileCount: i.paths.length,
          missing: !i.paths.every((p) => fs.existsSync(p)),
        }
      : { fileName: null, fileDir: null, fileCount: 0, missing: true }
    : { fileName: null, fileDir: null, fileCount: 0, missing: false }),
});

const iconCache = new Map();
function fileIconUrl(p) {
  const ext = path.extname(p).toLowerCase() || '(none)';
  if (!iconCache.has(ext)) {
    // cache the promise, not the value: 500 same-extension rows must not fan out 500 native icon lookups
    iconCache.set(ext, app.getFileIcon(p, { size: 'small' }).then((img) => img.toDataURL()).catch(() => null));
  }
  return iconCache.get(ext);
}

function createPanel() {
  panel = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    vibrancy: 'menu',
    visualEffectState: 'active',
    roundedCorners: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
  });
  panel.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  panel.on('blur', () => { if (!dialogOpen) panel.hide(); });
  panel.on('hide', () => registerHotkey());
}

function showPanel(nearTray = false) {
  const pos = nearTray && tray
    ? { x: Math.round(tray.getBounds().x - PANEL_W / 2 + tray.getBounds().width / 2), y: Math.round(tray.getBounds().y + tray.getBounds().height + 4) }
    : (() => {
        const p = screen.getCursorScreenPoint();
        const wa = screen.getDisplayNearestPoint(p).workArea;
        return {
          x: Math.min(Math.max(p.x - PANEL_W / 2, wa.x + 8), wa.x + wa.width - PANEL_W - 8),
          y: Math.min(Math.max(p.y, wa.y + 8), wa.y + wa.height - PANEL_H - 8),
        };
      })();
  panel.setPosition(pos.x, pos.y);
  panel.show();
  panel.focus();
  panel.webContents.send('panel:shown');
}

function togglePanel(nearTray) {
  if (panel.isVisible()) panel.hide();
  else showPanel(nearTray);
}

function tryRegister(accel) {
  try { return globalShortcut.register(accel, () => togglePanel(false)); } catch { return false; }
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  const wanted = settings.get().hotkey;
  if (!tryRegister(wanted) && wanted !== DEFAULTS.hotkey) {
    settings.set({ hotkey: DEFAULTS.hotkey });
    tryRegister(DEFAULTS.hotkey);
  }
}

function showWelcome() {
  welcome = new BrowserWindow({
    width: 460,
    height: 520,
    resizable: false,
    fullscreenable: false,
    title: 'Welcome to ClipChrono',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
  });
  welcome.loadFile(path.join(__dirname, '..', 'renderer', 'welcome.html'));
}

function setupIpc() {
  ipcMain.handle('history:list', (_e, query, folderId) =>
    Promise.all(store.list(query || '', folderId || null).map(async (i) => {
      const v = toView(i);
      if (i.type === 'file' && !v.missing) v.iconUrl = await fileIconUrl(i.paths[0]);
      return v;
    })));

  ipcMain.handle('item:select', (_e, id) => {
    const item = store.get(id);
    if (!item) return { ok: false };
    let filePlist = null;
    if (item.type === 'file') {
      if (!item.paths.every((p) => fs.existsSync(p))) return { ok: false, missing: true };
      try { filePlist = buildFilenamesPlist(item.paths); } catch { return { ok: false, missing: true }; }
    } else if (item.type !== 'text' && item.type !== 'image') {
      return { ok: false };
    }
    panel.hide();
    app.hide();
    if (item.type === 'text') clipboard.writeText(item.text);
    else if (item.type === 'image') clipboard.writeImage(nativeImage.createFromPath(item.imagePath));
    else {
      clipboard.clear();
      clipboard.writeBuffer('NSFilenamesPboardType', filePlist);
    }
    store.touch(id);
    if (systemPreferences.isTrustedAccessibilityClient(false)) {
      setTimeout(() => sendPasteKeystroke(), 150);
    }
    return { ok: true };
  });

  ipcMain.handle('item:openUrl', (_e, id) => {
    const item = store.get(id);
    if (!item || item.type !== 'text') return;
    try {
      const u = new URL(item.text.trim());
      if (u.protocol === 'http:' || u.protocol === 'https:') shell.openExternal(item.text.trim()).catch(() => {});
    } catch {}
  });

  ipcMain.handle('item:remove', (_e, ids) => store.remove(ids));
  ipcMain.handle('item:pin', (_e, id, pinned) => store.setPinned(id, pinned));
  ipcMain.handle('item:setFolder', (_e, itemId, folderId) => store.setItemFolder(itemId, folderId ?? null));
  ipcMain.handle('folders:list', () => store.listFolders().map((f) => ({ id: f.id, name: f.name })));
  ipcMain.handle('folders:create', (_e, name) => store.createFolder(String(name ?? '')));
  ipcMain.handle('folders:rename', (_e, id, name) => store.renameFolder(id, String(name ?? '')));
  ipcMain.handle('folders:delete', (_e, id) => store.deleteFolder(id));
  ipcMain.handle('history:clear', () => store.clearAll());

  ipcMain.handle('settings:get', () => ({
    ...settings.get(),
    accessibilityOk: systemPreferences.isTrustedAccessibilityClient(false),
    version: app.getVersion(),
  }));

  const localStamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  ipcMain.handle('backup:export', async () => {
    dialogOpen = true;
    let res;
    try { res = await dialog.showSaveDialog(panel, { defaultPath: `ClipChrono-backup-${localStamp()}.zip` }); }
    finally { dialogOpen = false; panel.focus(); }
    if (res.canceled || !res.filePath) return { ok: true, canceled: true };
    try {
      exportBackup({ dataDir: dataDir(), destZip: res.filePath, tmpRoot: app.getPath('temp') });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('backup:import', async () => {
    dialogOpen = true;
    let res;
    try {
      res = await dialog.showOpenDialog(panel, {
        filters: [{ name: 'ClipChrono backup', extensions: ['zip'] }],
        properties: ['openFile'],
      });
    } finally { dialogOpen = false; panel.focus(); }
    if (res.canceled || !res.filePaths.length) return { ok: true, canceled: true };
    try {
      const r = importBackup({ zipPath: res.filePaths[0], tmpRoot: app.getPath('temp'), store });
      return { ok: true, added: r.added, kept: r.kept };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('settings:set', (_e, patch) => {
    const before = settings.get();
    const { hotkey: requestedHotkey, ...rest } = patch;
    if (typeof requestedHotkey === 'string' && requestedHotkey !== before.hotkey) {
      // probe WITHOUT touching the old registration: a rejected probe changes nothing
      if (tryRegister(requestedHotkey)) {
        try { globalShortcut.unregister(before.hotkey); } catch {}
        settings.set({ hotkey: requestedHotkey });
      }
    }
    const after = settings.set(rest);
    if (after.launchAtLogin !== before.launchAtLogin) {
      if (after.launchAtLogin) launchagent.install({ execPath: process.execPath, appPath: app.getAppPath() });
      else launchagent.uninstall({});
    }
    if (after.expireDays !== before.expireDays) store.expire(after.expireDays);
    return settings.get();
  });

  ipcMain.handle('hotkey:recording', (_e, on) => {
    if (on) globalShortcut.unregisterAll();
    else registerHotkey();
  });

  ipcMain.handle('panel:hide', () => { panel.hide(); app.hide(); });
  ipcMain.handle('app:quit', () => app.quit());

  ipcMain.handle('welcome:accessibility', () => systemPreferences.isTrustedAccessibilityClient(true));

  ipcMain.handle('welcome:done', () => {
    settings.set({ onboarded: true });
    if (settings.get().launchAtLogin) {
      launchagent.install({ execPath: process.execPath, appPath: app.getAppPath() });
    }
    if (welcome) { welcome.close(); welcome = null; }
    showPanel(true);
  });
}

app.on('second-instance', () => { if (panel) showPanel(false); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {}); // stay alive in the tray

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  settings = createSettings(dataDir());
  store = createStore(dataDir(), { getMaxItems: () => settings.get().maxItems });

  // rewrite the LaunchAgent on every launch: npm updates move Electron's path,
  // and a stale plist would silently break start-at-login
  if (settings.get().onboarded && settings.get().launchAtLogin) {
    launchagent.install({ execPath: process.execPath, appPath: app.getAppPath() });
  }
  watcher = createWatcher({
    clipboard: clipboardAdapter,
    onText: (t) => { store.addText(t); if (panel && panel.isVisible()) panel.webContents.send('history:changed'); },
    onImage: (png) => { store.addImage(png, makeThumb(png)); if (panel && panel.isVisible()) panel.webContents.send('history:changed'); },
    onFile: (paths) => { store.addFile(paths); if (panel && panel.isVisible()) panel.webContents.send('history:changed'); },
  });

  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('📋');
  tray.on('click', () => togglePanel(true));
  tray.on('right-click', () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Open ClipChrono', click: () => showPanel(true) },
      { type: 'separator' },
      { label: 'Quit ClipChrono', role: 'quit' },
    ]));
  });

  createPanel();
  setupIpc();
  registerHotkey();
  watcher.start();
  store.expire(settings.get().expireDays);
  setInterval(() => store.expire(settings.get().expireDays), 6 * 3600 * 1000);

  if (!settings.get().onboarded) showWelcome();
});

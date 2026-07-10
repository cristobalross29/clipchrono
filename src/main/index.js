const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, clipboard, screen, systemPreferences } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createSettings, DEFAULTS } = require('./settings');
const { createStore } = require('./store');
const { createWatcher } = require('./watcher');
const launchagent = require('./launchagent');
const { sendPasteKeystroke } = require('./paster');

app.setName('Pastport');
if (!app.requestSingleInstanceLock()) app.quit();

const dataDir = () => app.getPath('userData');
let settings, store, watcher, tray, panel, welcome;

const PANEL_W = 360;
const PANEL_H = 480;

const clipboardAdapter = {
  readText: () => clipboard.readText(),
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
};

function makeThumb(pngBuffer) {
  return nativeImage.createFromBuffer(pngBuffer).resize({ height: 96 }).toPNG();
}

const toView = (i) => ({
  id: i.id,
  type: i.type,
  pinned: i.pinned,
  copiedAt: i.copiedAt,
  preview: i.type === 'text' ? i.text.slice(0, 300) : null,
  thumbUrl: i.type === 'image' ? pathToFileURL(i.thumbPath).href : null,
});

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
  panel.on('blur', () => panel.hide());
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

function registerHotkey() {
  globalShortcut.unregisterAll();
  const wanted = settings.get().hotkey;
  const ok = globalShortcut.register(wanted, () => togglePanel(false));
  if (!ok && wanted !== DEFAULTS.hotkey) {
    settings.set({ hotkey: DEFAULTS.hotkey });
    globalShortcut.register(DEFAULTS.hotkey, () => togglePanel(false));
  }
}

function showWelcome() {
  welcome = new BrowserWindow({
    width: 460,
    height: 520,
    resizable: false,
    fullscreenable: false,
    title: 'Welcome to Pastport',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
  });
  welcome.loadFile(path.join(__dirname, '..', 'renderer', 'welcome.html'));
}

function setupIpc() {
  ipcMain.handle('history:list', (_e, query) => store.list(query || '').map(toView));

  ipcMain.handle('item:select', (_e, id) => {
    const item = store.get(id);
    if (!item) return;
    panel.hide();
    app.hide();
    if (item.type === 'text') clipboard.writeText(item.text);
    else clipboard.writeImage(nativeImage.createFromPath(item.imagePath));
    store.touch(id);
    if (systemPreferences.isTrustedAccessibilityClient(false)) {
      setTimeout(() => sendPasteKeystroke(), 150);
    }
  });

  ipcMain.handle('item:remove', (_e, ids) => store.remove(ids));
  ipcMain.handle('item:pin', (_e, id, pinned) => store.setPinned(id, pinned));
  ipcMain.handle('history:clear', () => store.clearAll());

  ipcMain.handle('settings:get', () => ({
    ...settings.get(),
    accessibilityOk: systemPreferences.isTrustedAccessibilityClient(false),
    version: app.getVersion(),
  }));

  ipcMain.handle('settings:set', (_e, patch) => {
    const before = settings.get();
    const after = settings.set(patch);
    if (after.hotkey !== before.hotkey) registerHotkey();
    if (after.launchAtLogin !== before.launchAtLogin) {
      if (after.launchAtLogin) launchagent.install({ execPath: process.execPath, appPath: app.getAppPath() });
      else launchagent.uninstall({});
    }
    if (after.expireDays !== before.expireDays) store.expire(after.expireDays);
    return after;
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

app.on('second-instance', () => showPanel(false));
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
    onText: (t) => { store.addText(t); if (panel && panel.isVisible()) panel.webContents.send('panel:shown'); },
    onImage: (png) => { store.addImage(png, makeThumb(png)); if (panel && panel.isVisible()) panel.webContents.send('panel:shown'); },
  });

  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('📋');
  tray.on('click', () => togglePanel(true));
  tray.on('right-click', () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Open Pastport', click: () => showPanel(true) },
      { type: 'separator' },
      { label: 'Quit Pastport', role: 'quit' },
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

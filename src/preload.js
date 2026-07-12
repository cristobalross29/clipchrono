const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipchrono', {
  list: (query, folderId) => ipcRenderer.invoke('history:list', query, folderId),
  select: (id) => ipcRenderer.invoke('item:select', id),
  openUrl: (id) => ipcRenderer.invoke('item:openUrl', id),
  remove: (ids) => ipcRenderer.invoke('item:remove', ids),
  setPinned: (id, pinned) => ipcRenderer.invoke('item:pin', id, pinned),
  setItemFolder: (itemId, folderId) => ipcRenderer.invoke('item:setFolder', itemId, folderId),
  listFolders: () => ipcRenderer.invoke('folders:list'),
  createFolder: (name) => ipcRenderer.invoke('folders:create', name),
  renameFolder: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
  deleteFolder: (id) => ipcRenderer.invoke('folders:delete', id),
  clearAll: () => ipcRenderer.invoke('history:clear'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  setHotkeyRecording: (on) => ipcRenderer.invoke('hotkey:recording', on),
  hidePanel: () => ipcRenderer.invoke('panel:hide'),
  quit: () => ipcRenderer.invoke('app:quit'),
  requestAccessibility: () => ipcRenderer.invoke('welcome:accessibility'),
  finishOnboarding: () => ipcRenderer.invoke('welcome:done'),
  onShow: (cb) => ipcRenderer.on('panel:shown', () => cb()),
  onHistoryChanged: (cb) => ipcRenderer.on('history:changed', () => cb()),
});

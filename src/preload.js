const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pastport', {
  list: (query) => ipcRenderer.invoke('history:list', query),
  select: (id) => ipcRenderer.invoke('item:select', id),
  remove: (ids) => ipcRenderer.invoke('item:remove', ids),
  setPinned: (id, pinned) => ipcRenderer.invoke('item:pin', id, pinned),
  clearAll: () => ipcRenderer.invoke('history:clear'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  hidePanel: () => ipcRenderer.invoke('panel:hide'),
  quit: () => ipcRenderer.invoke('app:quit'),
  requestAccessibility: () => ipcRenderer.invoke('welcome:accessibility'),
  finishOnboarding: () => ipcRenderer.invoke('welcome:done'),
  onShow: (cb) => ipcRenderer.on('panel:shown', () => cb()),
});

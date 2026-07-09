const { app, Tray, Menu, nativeImage } = require('electron');

app.setName('Pastport');
if (!app.requestSingleInstanceLock()) app.quit();

let tray;
app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('📋');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quit Pastport', role: 'quit' }]));
});

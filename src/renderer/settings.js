async function loadSettingsView() {
  const s = await pastport.getSettings();
  document.querySelector('#set-hotkey').value = s.hotkey;
  document.querySelector('#set-max').value = s.maxItems;
  document.querySelector('#set-expire').value = String(s.expireDays);
  document.querySelector('#set-login').checked = s.launchAtLogin;
  document.querySelector('#set-access').textContent = s.accessibilityOk ? 'Enabled ✓' : 'Grant Accessibility in System Settings';
  document.querySelector('#set-version').textContent = 'v' + s.version;
}
window.loadSettingsView = loadSettingsView;

document.querySelector('#set-hotkey').onchange = (e) => pastport.setSettings({ hotkey: e.target.value });
document.querySelector('#set-max').onchange = (e) => {
  const v = Math.max(50, Math.min(5000, Number(e.target.value) || 500));
  e.target.value = v;
  pastport.setSettings({ maxItems: v });
};
document.querySelector('#set-expire').onchange = (e) => pastport.setSettings({ expireDays: Number(e.target.value) });
document.querySelector('#set-login').onchange = (e) => pastport.setSettings({ launchAtLogin: e.target.checked });
document.querySelector('#settings-back').onclick = () => showView('list');
document.querySelector('#app-quit').onclick = () => pastport.quit();

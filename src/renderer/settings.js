const recorderBtn = document.querySelector('#set-hotkey-recorder');
const hotkeyHint = document.querySelector('#set-hotkey-hint');
let recording = false;
let currentHotkey = '';

function showHotkey() {
  recorderBtn.textContent = currentHotkey ? accelerator.formatAccelerator(currentHotkey) : '';
  recorderBtn.classList.remove('recording');
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  pastport.setHotkeyRecording(false);
  showHotkey();
}

recorderBtn.onclick = async () => {
  if (recording) return;
  hotkeyHint.textContent = '';
  recorderBtn.textContent = 'Press keys…';
  recorderBtn.classList.add('recording');
  recorderBtn.focus();
  await pastport.setHotkeyRecording(true); // arm only after the global shortcut is suspended
  recording = true;
};

recorderBtn.onblur = () => stopRecording();
window.addEventListener('blur', () => stopRecording());

recorderBtn.addEventListener('keydown', async (e) => {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.code === 'Escape') { stopRecording(); return; }
  const accel = accelerator.eventToAccelerator(e);
  if (!accel) {
    if (accelerator.keyFromCode(e.code)) hotkeyHint.textContent = 'Include ⌘, ⌃ or ⌥';
    return;
  }
  recording = false;
  try {
    const s = await pastport.setSettings({ hotkey: accel });
    currentHotkey = s.hotkey;
    hotkeyHint.textContent = s.hotkey === accel ? '' : 'In use by another app';
  } finally {
    await pastport.setHotkeyRecording(false); // never leave the shortcut unregistered
    showHotkey();
    recorderBtn.blur();
  }
});

async function loadSettingsView() {
  const s = await pastport.getSettings();
  currentHotkey = s.hotkey;
  showHotkey();
  document.querySelector('#set-max').value = s.maxItems;
  document.querySelector('#set-expire').value = String(s.expireDays);
  document.querySelector('#set-login').checked = s.launchAtLogin;
  document.querySelector('#set-access').textContent = s.accessibilityOk ? 'Enabled ✓' : 'Grant Accessibility in System Settings';
  document.querySelector('#set-version').textContent = 'v' + s.version;
}
window.loadSettingsView = loadSettingsView;

document.querySelector('#set-max').onchange = (e) => {
  const n = Number(e.target.value);
  const v = e.target.value === '' || !Number.isFinite(n) ? 500 : Math.max(50, Math.min(5000, n));
  e.target.value = v;
  pastport.setSettings({ maxItems: v });
};
document.querySelector('#set-expire').onchange = (e) => pastport.setSettings({ expireDays: Number(e.target.value) });
document.querySelector('#set-login').onchange = (e) => pastport.setSettings({ launchAtLogin: e.target.checked });
document.querySelector('#settings-back').onclick = () => showView('list');
document.querySelector('#app-quit').onclick = () => pastport.quit();

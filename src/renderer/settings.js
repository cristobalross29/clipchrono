const recorderBtn = document.querySelector('#set-hotkey-recorder');
const hotkeyHint = document.querySelector('#set-hotkey-hint');
let armState = 'idle'; // 'idle' | 'arming' | 'recording' — blur during the arming await must not orphan the suspension
let currentHotkey = '';

function showHotkey() {
  recorderBtn.textContent = currentHotkey ? accelerator.formatAccelerator(currentHotkey) : '';
  recorderBtn.classList.remove('recording');
}

function stopRecording() {
  if (armState === 'idle') return;
  const wasRecording = armState === 'recording';
  armState = 'idle';
  if (wasRecording) clipchrono.setHotkeyRecording(false);
  showHotkey();
}

recorderBtn.onclick = async () => {
  if (armState !== 'idle') return;
  armState = 'arming';
  hotkeyHint.textContent = '';
  recorderBtn.textContent = 'Press keys…';
  recorderBtn.classList.add('recording');
  recorderBtn.focus();
  let armed = false;
  try {
    await clipchrono.setHotkeyRecording(true);
    armed = true;
  } catch {}
  if (!armed || armState !== 'arming') {
    if (armed) clipchrono.setHotkeyRecording(false); // blur landed mid-arm: undo the suspension
    if (armState === 'arming') armState = 'idle';
    showHotkey();
    return;
  }
  armState = 'recording';
};

recorderBtn.onblur = () => stopRecording();
window.addEventListener('blur', () => stopRecording());

recorderBtn.addEventListener('keydown', async (e) => {
  if (armState !== 'recording') return;
  e.preventDefault();
  e.stopPropagation();
  if (e.code === 'Escape') { stopRecording(); return; }
  const accel = accelerator.eventToAccelerator(e);
  if (!accel) {
    if (accelerator.keyFromCode(e.code)) hotkeyHint.textContent = 'Include ⌘, ⌃ or ⌥';
    return;
  }
  armState = 'idle';
  try {
    const s = await clipchrono.setSettings({ hotkey: accel });
    currentHotkey = s.hotkey;
    hotkeyHint.textContent = s.hotkey === accel ? '' : 'In use by another app';
  } catch {
    hotkeyHint.textContent = 'Could not save shortcut';
  } finally {
    await clipchrono.setHotkeyRecording(false); // never leave the shortcut unregistered
    showHotkey();
    recorderBtn.blur();
  }
});

async function loadSettingsView() {
  const s = await clipchrono.getSettings();
  currentHotkey = s.hotkey;
  showHotkey();
  document.querySelector('#set-max').value = s.maxItems;
  document.querySelector('#set-expire').value = String(s.expireDays);
  document.querySelector('#set-login').checked = s.launchAtLogin;
  document.querySelector('#set-access').textContent = s.accessibilityOk ? 'Enabled ✓' : 'Grant Accessibility in System Settings';
  document.querySelector('#set-version').textContent = 'v' + s.version;
  if (backupHint) backupHint.textContent = '';
}
window.loadSettingsView = loadSettingsView;

document.querySelector('#set-max').onchange = (e) => {
  const n = Number(e.target.value);
  const v = e.target.value === '' || !Number.isFinite(n) ? 500 : Math.max(50, Math.min(5000, n));
  e.target.value = v;
  clipchrono.setSettings({ maxItems: v });
};
document.querySelector('#set-expire').onchange = (e) => clipchrono.setSettings({ expireDays: Number(e.target.value) });
document.querySelector('#set-login').onchange = (e) => clipchrono.setSettings({ launchAtLogin: e.target.checked });
document.querySelector('#settings-back').onclick = () => showView('list');
document.querySelector('#app-quit').onclick = () => clipchrono.quit();

const backupHint = document.querySelector('#set-backup-hint');

document.querySelector('#set-export').onclick = async () => {
  backupHint.textContent = 'Exporting…';
  try {
    const r = await clipchrono.exportBackup();
    backupHint.textContent = r.canceled ? '' : r.ok ? 'Backup saved ✓' : 'Export failed: ' + r.error;
  } catch {
    backupHint.textContent = 'Export failed';
  }
};

document.querySelector('#set-import').onclick = async () => {
  backupHint.textContent = 'Importing…';
  try {
    const r = await clipchrono.importBackup();
    if (r.canceled) { backupHint.textContent = ''; return; }
    if (!r.ok) {
      backupHint.textContent = r.error === 'NOT_A_BACKUP'
        ? "This doesn't look like a ClipChrono backup."
        : 'Import failed: ' + r.error;
      return;
    }
    backupHint.textContent = `Imported ${r.kept} new item${r.kept === 1 ? '' : 's'} ✓`;
    if (window.refreshAll) window.refreshAll();
  } catch {
    backupHint.textContent = 'Import failed';
  }
};

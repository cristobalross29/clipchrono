const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  hotkey: 'CommandOrControl+Shift+V',
  maxItems: 500,
  expireDays: 0,
  launchAtLogin: true,
  onboarded: false,
};

function createSettings(dir) {
  const file = path.join(dir, 'settings.json');
  let cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }

  function get() {
    return { ...cache };
  }

  function set(patch) {
    cache = { ...cache, ...patch };
    const max = Number(cache.maxItems);
    cache.maxItems = Number.isFinite(max) ? Math.max(50, Math.min(5000, max)) : DEFAULTS.maxItems;
    const days = Number(cache.expireDays);
    cache.expireDays = Number.isFinite(days) ? Math.max(0, days) : 0;
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, file);
    return get();
  }

  return { get, set };
}

module.exports = { createSettings, DEFAULTS };

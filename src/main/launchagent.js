const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const LABEL = 'com.clipchrono.agent';

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function plistFor({ execPath, appPath }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(execPath)}</string>
    <string>${escapeXml(appPath)}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
</dict>
</plist>
`;
}

function plistPath(home) {
  return path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
}

const defaultRun = (cmd, args) => {
  try { spawnSync(cmd, args); } catch {}
};

function install({ execPath, appPath, home = os.homedir(), run = defaultRun }) {
  const p = plistPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, plistFor({ execPath, appPath }));
}

function uninstall({ home = os.homedir(), run = defaultRun } = {}) {
  const p = plistPath(home);
  run('launchctl', ['bootout', `gui/${process.getuid()}`, p]);
  try { fs.unlinkSync(p); } catch {}
}

module.exports = { LABEL, plistFor, plistPath, install, uninstall };

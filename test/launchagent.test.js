const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { plistFor, plistPath, install, uninstall, LABEL } = require('../src/main/launchagent');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pastport-'));

test('plist contains label, exec path, app path, RunAtLoad', () => {
  const xml = plistFor({ execPath: '/usr/local/Electron', appPath: '/apps/pastport' });
  assert.ok(xml.includes(`<string>${LABEL}</string>`));
  assert.ok(xml.includes('<string>/usr/local/Electron</string>'));
  assert.ok(xml.includes('<string>/apps/pastport</string>'));
  assert.ok(xml.includes('<key>RunAtLoad</key><true/>'));
});

test('plist escapes XML special chars in paths', () => {
  const xml = plistFor({ execPath: '/a&b/<x>', appPath: '/ok' });
  assert.ok(xml.includes('/a&amp;b/&lt;x&gt;'));
});

test('install writes plist to LaunchAgents; uninstall removes and boots out', () => {
  const home = tmp();
  const calls = [];
  const run = (cmd, args) => calls.push([cmd, ...args]);
  install({ execPath: '/e', appPath: '/a', home, run });
  assert.ok(fs.existsSync(plistPath(home)));
  uninstall({ home, run });
  assert.ok(!fs.existsSync(plistPath(home)));
  assert.ok(calls.some((c) => c[0] === 'launchctl' && c[1] === 'bootout'));
});

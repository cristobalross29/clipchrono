#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');

const appDir = path.join(__dirname, '..');
const child = spawn(electron, [appDir], { detached: true, stdio: 'ignore' });
child.on('error', (err) => {
  console.error('ClipChrono failed to start:', err.message);
  process.exit(1);
});
child.unref();
console.log('📋 ClipChrono is starting — look for it in your menu bar. Press ⌘⇧V anywhere to open your clipboard history.');

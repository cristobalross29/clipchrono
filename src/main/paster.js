const { execFile } = require('node:child_process');

const PASTE_SCRIPT = 'tell application "System Events" to keystroke "v" using command down';

function sendPasteKeystroke(execFileImpl = execFile) {
  execFileImpl('/usr/bin/osascript', ['-e', PASTE_SCRIPT], () => {});
}

module.exports = { PASTE_SCRIPT, sendPasteKeystroke };

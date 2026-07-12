const sha1 = require('./hash');

function createWatcher({ clipboard, onText, onImage, onFile, intervalMs = 500 }) {
  let lastTextHash = null;
  let lastImageHash = null;
  let lastFileHash = null;
  let timer = null;

  function check() {
    if (clipboard.hasConcealed()) return;
    const files = clipboard.readFilePaths ? clipboard.readFilePaths() : null;
    if (files && files.length) {
      const hash = sha1('file:' + JSON.stringify(files));
      if (hash !== lastFileHash) {
        lastFileHash = hash;
        lastTextHash = null;
        lastImageHash = null;
        if (onFile) onFile(files);
      }
      return;
    }
    lastFileHash = null;
    const png = clipboard.readImagePng();
    if (png) {
      const hash = sha1(png);
      if (hash !== lastImageHash) {
        lastImageHash = hash;
        lastTextHash = null;
        onImage(png);
      }
      return;
    }
    lastImageHash = null;
    const text = clipboard.readText();
    if (!text || !text.trim()) return;
    const hash = sha1(text);
    if (hash === lastTextHash) return;
    lastTextHash = hash;
    onText(text);
  }

  function start() {
    if (timer) return;
    check();
    timer = setInterval(check, intervalMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { check, start, stop };
}

module.exports = { createWatcher };

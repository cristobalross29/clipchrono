const sha1 = require('./hash');

function createWatcher({ clipboard, onText, onImage, onFile, intervalMs = 500 }) {
  let lastTextHash = null;
  let lastImageHash = null;
  let lastFileKey = null;
  let timer = null;

  function check() {
    if (clipboard.hasConcealed()) return;
    const files = clipboard.readFilePaths ? clipboard.readFilePaths() : null;
    if (files && files.length) {
      // A file copied in Finder stays on the pasteboard as a live reference; if the
      // file is then moved, the resolved paths change while the reference does not.
      // Key change-detection on the stable reference so a move is not seen as a new
      // copy. Fall back to the paths when no reference is exposed.
      const ref = clipboard.readFileRef ? clipboard.readFileRef() : null;
      const key = ref ? 'ref:' + ref + '|' + files.length : 'paths:' + JSON.stringify(files);
      if (key !== lastFileKey) {
        lastFileKey = key;
        lastTextHash = null;
        lastImageHash = null;
        if (onFile) onFile(files);
      }
      return;
    }
    lastFileKey = null;
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

const sha1 = require('./hash');

function createWatcher({ clipboard, onText, onImage, intervalMs = 500 }) {
  let lastTextHash = null;
  let lastImageHash = null;
  let timer = null;

  function check() {
    if (clipboard.hasConcealed()) return;
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

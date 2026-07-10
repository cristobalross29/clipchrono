(function () {
  const CODE_MAP = {
    Space: 'Space', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';',
    Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  };

  function keyFromCode(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
    return CODE_MAP[code] || null;
  }

  function eventToAccelerator(e) {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) return null;
    const key = keyFromCode(e.code);
    if (!key) return null;
    const parts = [];
    if (e.metaKey) parts.push('Command');
    if (e.ctrlKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(key);
    return parts.join('+');
  }

  const SYMBOLS = {
    CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘',
    Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧',
  };

  function formatAccelerator(accel) {
    return accel.split('+').map((p) => SYMBOLS[p] || p).join('');
  }

  const api = { keyFromCode, eventToAccelerator, formatAccelerator };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.accelerator = api;
})();

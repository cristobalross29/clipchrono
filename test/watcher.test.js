const test = require('node:test');
const assert = require('node:assert');
const { createWatcher } = require('../src/main/watcher');

function fakeClipboard() {
  return {
    text: '', png: null, files: null, fileRef: null, concealed: false,
    readText() { return this.text; },
    readImagePng() { return this.png; },
    readFilePaths() { return this.files; },
    readFileRef() { return this.fileRef; },
    hasConcealed() { return this.concealed; },
  };
}

function setup() {
  const clip = fakeClipboard();
  const texts = [];
  const images = [];
  const files = [];
  const w = createWatcher({ clipboard: clip, onText: (t) => texts.push(t), onImage: (b) => images.push(b), onFile: (p) => files.push(p) });
  return { clip, texts, images, files, w };
}

test('captures text once per change', () => {
  const { clip, texts, w } = setup();
  clip.text = 'hello';
  w.check();
  w.check();
  clip.text = 'world';
  w.check();
  assert.deepStrictEqual(texts, ['hello', 'world']);
});

test('ignores empty text', () => {
  const { clip, texts, w } = setup();
  clip.text = '   ';
  w.check();
  assert.deepStrictEqual(texts, []);
});

test('image takes precedence over text and fires once', () => {
  const { clip, texts, images, w } = setup();
  clip.text = 'caption';
  clip.png = Buffer.from('img1');
  w.check();
  w.check();
  assert.strictEqual(images.length, 1);
  assert.deepStrictEqual(texts, []);
});

test('text copied after image is captured', () => {
  const { clip, texts, images, w } = setup();
  clip.png = Buffer.from('img1');
  w.check();
  clip.png = null;
  clip.text = 'after';
  w.check();
  assert.strictEqual(images.length, 1);
  assert.deepStrictEqual(texts, ['after']);
});

test('concealed clipboard (password managers) is never captured', () => {
  const { clip, texts, w } = setup();
  clip.text = 'hunter2';
  clip.concealed = true;
  w.check();
  assert.deepStrictEqual(texts, []);
  clip.concealed = false;
  clip.text = 'normal';
  w.check();
  assert.deepStrictEqual(texts, ['normal']);
});

test('start() checks immediately, polls on interval, stop() halts polling', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { clip, texts, w } = setup();
  clip.text = 'first';
  w.start();
  assert.deepStrictEqual(texts, ['first']);
  clip.text = 'second';
  t.mock.timers.tick(500);
  assert.deepStrictEqual(texts, ['first', 'second']);
  w.stop();
  clip.text = 'third';
  t.mock.timers.tick(5000);
  assert.deepStrictEqual(texts, ['first', 'second']);
});

test('start() twice does not double-poll', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { clip, texts, w } = setup();
  clip.text = 'one';
  w.start();
  w.start();
  clip.text = 'two';
  t.mock.timers.tick(500);
  assert.deepStrictEqual(texts, ['one', 'two']);
  w.stop();
});

test('file copy takes precedence over image and text, fires once', () => {
  const { clip, texts, images, files, w } = setup();
  clip.files = ['/Users/x/a.pdf'];
  clip.png = Buffer.from('icon');
  clip.text = 'a.pdf';
  w.check();
  w.check();
  assert.deepStrictEqual(files, [['/Users/x/a.pdf']]);
  assert.deepStrictEqual(images, []);
  assert.deepStrictEqual(texts, []);
});

test('different file sets are captured separately; text after files works', () => {
  const { clip, texts, files, w } = setup();
  clip.files = ['/a.txt'];
  w.check();
  clip.files = ['/a.txt', '/b.txt'];
  w.check();
  clip.files = null;
  clip.text = 'after';
  w.check();
  assert.deepStrictEqual(files, [['/a.txt'], ['/a.txt', '/b.txt']]);
  assert.deepStrictEqual(texts, ['after']);
});

test('a copied file that is moved (same ref, new resolved path) is not recaptured', () => {
  const { clip, files, w } = setup();
  clip.fileRef = 'file:///.file/id=6571367.48157742';
  clip.files = ['/Users/x/Downloads/a.png'];
  w.check();
  // file moved to Trash: the pasteboard reference is unchanged, but NSFilenames
  // re-resolves to the new path. This must NOT look like a fresh copy.
  clip.files = ['/Users/x/.Trash/a.png'];
  w.check();
  assert.deepStrictEqual(files, [['/Users/x/Downloads/a.png']]);
  // a genuinely different file (new reference) IS captured
  clip.fileRef = 'file:///.file/id=6571367.99999999';
  clip.files = ['/Users/x/Downloads/b.png'];
  w.check();
  assert.strictEqual(files.length, 2);
});

test('clipboard adapters without readFilePaths still work', () => {
  const clip = {
    text: 'hi',
    readText() { return this.text; },
    readImagePng() { return null; },
    hasConcealed() { return false; },
  };
  const texts = [];
  const w = createWatcher({ clipboard: clip, onText: (t) => texts.push(t), onImage: () => {} });
  w.check();
  assert.deepStrictEqual(texts, ['hi']);
});

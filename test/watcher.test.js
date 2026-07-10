const test = require('node:test');
const assert = require('node:assert');
const { createWatcher } = require('../src/main/watcher');

function fakeClipboard() {
  return {
    text: '', png: null, concealed: false,
    readText() { return this.text; },
    readImagePng() { return this.png; },
    hasConcealed() { return this.concealed; },
  };
}

function setup() {
  const clip = fakeClipboard();
  const texts = [];
  const images = [];
  const w = createWatcher({ clipboard: clip, onText: (t) => texts.push(t), onImage: (b) => images.push(b) });
  return { clip, texts, images, w };
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

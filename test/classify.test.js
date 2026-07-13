const test = require('node:test');
const assert = require('node:assert');
const { classifyText } = require('../src/main/classify');

test('bare http/https URLs classify as url', () => {
  assert.strictEqual(classifyText('https://example.com/path?q=1'), 'url');
  assert.strictEqual(classifyText('http://localhost:3000'), 'url');
  assert.strictEqual(classifyText('  https://example.com  '), 'url');
});

test('prose containing a URL is not a url', () => {
  assert.strictEqual(classifyText('check out https://example.com today'), null);
});

test('multi-line text starting with a URL is not a url', () => {
  assert.strictEqual(classifyText('https://example.com\nsecond line'), null);
});

test('non-http schemes and degenerate urls are not urls', () => {
  assert.strictEqual(classifyText('ftp://example.com'), null);
  assert.strictEqual(classifyText('file:///Users/x'), null);
  assert.strictEqual(classifyText('https://'), null);
});

test('real code snippets classify as code', () => {
  assert.strictEqual(classifyText('function add(a, b) {\n  return a + b;\n}'), 'code');
  assert.strictEqual(classifyText('const x = 1;\nconst y = 2;'), 'code');
  assert.strictEqual(classifyText('def greet(name):\n    return f"hi {name}"'), 'code');
});

test('single-line text is never code', () => {
  assert.strictEqual(classifyText('const x = 1;'), null);
});

test('plain prose is not code', () => {
  assert.strictEqual(classifyText('Hello there.\nHow are you today?\nSee you soon.'), null);
  assert.strictEqual(classifyText('Shopping list:\n- milk\n- eggs'), null);
});

test('empty-ish input returns null', () => {
  assert.strictEqual(classifyText(''), null);
  assert.strictEqual(classifyText('   '), null);
});

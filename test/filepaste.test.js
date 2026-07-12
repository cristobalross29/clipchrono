const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { parseFilenamesPlist, buildFilenamesPlist, fileUrlToPath } = require('../src/main/filepaste');

const FINDER_PLIST = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
\t<string>/Users/x/report.pdf</string>
\t<string>/Users/x/A &amp; B &lt;draft&gt;.txt</string>
</array>
</plist>`);

test('parses a Finder-style XML plist with escaped entities', () => {
  assert.deepStrictEqual(parseFilenamesPlist(FINDER_PLIST), [
    '/Users/x/report.pdf',
    '/Users/x/A & B <draft>.txt',
  ]);
});

test('parses a binary plist', () => {
  const bin = execFileSync('/usr/bin/plutil', ['-convert', 'binary1', '-o', '-', '-'], { input: FINDER_PLIST });
  assert.deepStrictEqual(parseFilenamesPlist(bin), [
    '/Users/x/report.pdf',
    '/Users/x/A & B <draft>.txt',
  ]);
});

test('build/parse round-trips paths with special characters', () => {
  const paths = ['/Users/x/a & b.txt', '/tmp/<weird> "name".png', '/Users/x/café.md', '/tmp/new\nline.txt'];
  assert.deepStrictEqual(parseFilenamesPlist(buildFilenamesPlist(paths)), paths);
});

test('garbage, empty, non-array, and relative-path plists return null', () => {
  assert.strictEqual(parseFilenamesPlist(Buffer.from('not a plist at all')), null);
  assert.strictEqual(parseFilenamesPlist(Buffer.alloc(0)), null);
  assert.strictEqual(parseFilenamesPlist(null), null);
  const dict = execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], { input: '{"a":1}' });
  assert.strictEqual(parseFilenamesPlist(dict), null);
  const rel = execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], { input: '["not-absolute.txt"]' });
  assert.strictEqual(parseFilenamesPlist(rel), null);
});

test('fileUrlToPath decodes percent-encoding', () => {
  assert.strictEqual(fileUrlToPath('file:///Users/x/My%20File.pdf'), '/Users/x/My File.pdf');
  assert.strictEqual(fileUrlToPath('file:///Users/x/caf%C3%A9.md'), '/Users/x/café.md');
});

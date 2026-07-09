const test = require('node:test');
const assert = require('node:assert');
const pkg = require('../package.json');

test('package is wired correctly', () => {
  assert.strictEqual(pkg.name, 'pastport');
  assert.strictEqual(pkg.bin.pastport, 'bin/pastport.js');
  assert.ok(pkg.dependencies.electron);
});

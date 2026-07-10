const test = require('node:test');
const assert = require('node:assert');
const pkg = require('../package.json');

test('package is wired correctly', () => {
  assert.strictEqual(pkg.name, 'clipchrono');
  assert.strictEqual(pkg.bin.clipchrono, 'bin/clipchrono.js');
  assert.ok(pkg.dependencies.electron);
});

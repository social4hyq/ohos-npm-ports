// @test-package: bufferutil
const assert = require('node:assert/strict');
const bufferutil = require('bufferutil');

assert.equal(typeof bufferutil.mask, 'function');
assert.equal(typeof bufferutil.unmask, 'function');

const source = Buffer.from('cross-platform bufferutil probe');
const key = Buffer.from([0x12, 0x34, 0x56, 0x78]);
const masked = Buffer.alloc(source.length);
bufferutil.mask(source, key, masked, 0, source.length);
assert.notDeepEqual(masked, source, 'mask should change the payload before unmasking');
bufferutil.unmask(masked, key);
assert.deepEqual(masked, source);

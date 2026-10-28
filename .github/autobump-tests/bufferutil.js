// @test-package: bufferutil
import assert from 'node:assert/strict';
import bufferutil from 'bufferutil';
const source=Buffer.from('openharmony');
const key=Buffer.from([1,2,3,4]);
const masked=Buffer.alloc(source.length);
bufferutil.mask(source,key,masked,0,source.length);
assert.notDeepEqual(masked,source);
bufferutil.unmask(masked,key);
assert.deepEqual(masked,source);

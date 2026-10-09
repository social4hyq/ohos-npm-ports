// @test-package: @opentui/core-openharmony-arm64
// @test-platforms: openharmony
// @test-platform-reason: OHOS/arm64 native slot; Linux and Windows cannot load its OHOS ELF.
import assert from 'node:assert/strict'; import fs from 'node:fs';
const {default:nativePath}=await import('@opentui/core-openharmony-arm64');
assert.equal(typeof nativePath,'string'); assert.match(nativePath,/libopentui\.so$/); assert.equal(fs.statSync(nativePath).isFile(),true);

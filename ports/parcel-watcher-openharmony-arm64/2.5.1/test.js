// @test-package: @parcel/watcher-openharmony-arm64
// @test-platforms: openharmony
// @test-platform-reason: OHOS/arm64-only native slot; non-OHOS hosts cannot load its binary.
const assert=require('node:assert/strict'),watcher=require('@parcel/watcher-openharmony-arm64');
assert.equal(typeof watcher.writeSnapshot,'function'); assert.equal(typeof watcher.getEventsSince,'function');

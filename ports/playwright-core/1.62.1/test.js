// @test-package: playwright-core
const assert=require('node:assert/strict'),path=require('node:path'),pw=require('playwright-core');
for(const name of ['chromium','firefox','webkit'])assert.equal(typeof pw[name]?.launch,'function');
const dir=path.dirname(require.resolve('playwright-core/package.json')),ohos=require(path.join(dir,'lib','ohos'));
for(const name of ['HdcBackend','launchViaHdc','takeScreenshot','resolveLaunchConfig'])assert.ok(name in ohos,'missing '+name); assert.equal(typeof ohos.chromium?.launch,'function');

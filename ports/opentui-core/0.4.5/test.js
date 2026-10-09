// @test-package: @opentui/core
// @test-runtime: bun
// @test-dependency-platforms: openharmony
// @test-dependency: bun@1.4.2=npm:@ohos-npm-ports/bun@1.4.2-1
(async()=>{const assert=require('node:assert/strict'); const core=await import('@opentui/core');
assert.equal(typeof core.createCliRenderer,'function'); assert.equal(typeof core.TextRenderable,'function');
if(typeof core.createTestRenderer==='function'){const setup=await core.createTestRenderer({width:30,height:10});const text=new core.TextRenderable(setup.renderer,{content:'opentui smoke'});setup.renderer.root.add(text);await setup.renderOnce();assert.match(setup.captureCharFrame(),/opentui smoke/);await setup.renderer.destroy();}
})().catch(e=>{console.error(e);process.exitCode=1;});

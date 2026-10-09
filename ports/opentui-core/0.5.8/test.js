// @test-package: @opentui/core
// @test-runtime: bun
// @test-dependency: bun@npm:@ohos-npm-ports/bun@1.4.2-1
(async()=>{const assert=require('node:assert/strict'); const core=await import('@opentui/core'); const {createTestRenderer}=await import('@opentui/core/testing');
assert.equal(typeof createTestRenderer,'function');
const setup=await createTestRenderer({width:30,height:10});const box=new core.BoxRenderable(setup.renderer,{width:20,height:3,border:true,title:'opentui smoke'});
setup.renderer.root.add(box);await setup.renderOnce();assert.match(setup.captureCharFrame(),/opentui smoke/);await setup.renderer.destroy();
})().catch(e=>{console.error(e);process.exitCode=1;});

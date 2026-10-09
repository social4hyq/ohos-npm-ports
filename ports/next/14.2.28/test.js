// @test-package: next
const assert=require('node:assert/strict'); (async()=>{const swc=require('next/dist/build/swc'); const bindings=await swc.loadBindings();
assert.equal(bindings.isWasm,false); assert.equal(typeof bindings.transformSync,'function');
const out=bindings.transformSync('const answer: number = 42;','probe.ts',{jsc:{parser:{syntax:'typescript'}},sourceMaps:false});
assert.match(out.code,/answer/); assert.doesNotMatch(out.code,/: number/);})().catch(e=>{console.error(e);process.exitCode=1;});

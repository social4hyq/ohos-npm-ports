// @test-runtime: bun
// @test-dependency: bun@1.4.2=npm:@ohos-npm-ports/bun@1.4.2-1
// @test-dependency-platforms: openharmony
// @test-package: bun-plugin-tailwind
const assert=require('node:assert/strict');
(async()=>{const {default:plugin}=await import('bun-plugin-tailwind');
assert.equal(plugin.name,'@tailwindcss/bun'); let beforeParse,load;
plugin.setup({config:{root:process.cwd()},onBeforeParse(filter,options){beforeParse={filter,options};},onLoad(filter,callback){load={filter,callback};}});
assert.ok(beforeParse.options.napiModule); assert.equal(beforeParse.options.symbol,'tw_on_before_parse'); assert.equal(typeof load.callback,'function');})().catch(e=>{console.error(e);process.exitCode=1;});

// @test-package: bun
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{join}=require('node:path');
const bin=join('node_modules','.bin',process.platform==='win32'?'bun.cmd':'bun');
const version=spawnSync(bin,['--version'],{encoding:'utf8',shell:process.platform==='win32'}); assert.equal(version.status,0,version.stderr||version.stdout); assert.match(version.stdout,/^1\./m);
const run=spawnSync(bin,['-e','console.log(20+22)'],{encoding:'utf8',shell:process.platform==='win32'}); assert.equal(run.status,0,run.stderr||run.stdout); assert.match(run.stdout,/42/);

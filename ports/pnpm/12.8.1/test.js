// @test-package: pnpm
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process'),{join}=require('node:path'); const bin=join(process.cwd(),'node_modules','.bin',process.platform==='win32'?'pnpm.cmd':'pnpm');
let r=spawnSync(bin,['--version'],{encoding:'utf8',shell:process.platform==='win32'}); assert.equal(r.status,0,r.stderr||r.stdout);
const dir=join(process.cwd(),'pnpm-smoke');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(join(dir,'package.json'),JSON.stringify({name:'pnpm-smoke',private:true,scripts:{smoke:'node -e "console.log(\'PNPM_PORT_SMOKE_OK\')"'}}));
r=spawnSync(bin,['install','--lockfile=false','--ignore-scripts'],{cwd:dir,encoding:'utf8',shell:process.platform==='win32'});assert.equal(r.status,0,r.stderr||r.stdout);
r=spawnSync(bin,['run','smoke'],{cwd:dir,encoding:'utf8',shell:process.platform==='win32'});assert.equal(r.status,0,r.stderr||r.stdout);assert.match(r.stdout,/PNPM_PORT_SMOKE_OK/);

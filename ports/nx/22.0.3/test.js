// @test-package: nx
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process'),{join}=require('node:path');
const dir=join(process.cwd(),'nx-smoke'); fs.mkdirSync(join(dir,'packages','fixture'),{recursive:true}); fs.writeFileSync(join(dir,'nx.json'),'{}');
fs.writeFileSync(join(dir,'package.json'),JSON.stringify({name:'nx-smoke',private:true,workspaces:['packages/*']}));
fs.writeFileSync(join(dir,'packages','fixture','package.json'),JSON.stringify({name:'fixture',version:'1.0.0',scripts:{build:'node -e "console.log(\'NX_PORT_SMOKE_OK\')"'}}));
const bin=join(process.cwd(),'node_modules','.bin',process.platform==='win32'?'nx.cmd':'nx'); const r=spawnSync(bin,['run','fixture:build'],{cwd:dir,encoding:'utf8',shell:process.platform==='win32',env:{...process.env,NX_SOCKET_DIR:join(dir,'.nx-sock')}});
assert.equal(r.status,0,r.stderr||r.stdout); assert.match(r.stdout,/NX_PORT_SMOKE_OK/);

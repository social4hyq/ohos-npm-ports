// @test-package: oxlint-tsgolint
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process'),{join}=require('node:path');
fs.writeFileSync('tsconfig.json',JSON.stringify({compilerOptions:{strict:true}})); fs.writeFileSync('bad.ts','const n = 1 as unknown as string | undefined;\n');
const bin=join('node_modules','.bin',process.platform==='win32'?'tsgolint.cmd':'tsgolint'); const r=spawnSync(bin,['-tsconfig','tsconfig.json','bad.ts'],{encoding:'utf8',shell:process.platform==='win32'});
assert.match(String(r.stdout)+'\n'+String(r.stderr),/no-unsafe-type-assertion/);

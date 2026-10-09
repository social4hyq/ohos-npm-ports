// @test-package: @prisma/engines
// @test-platforms: openharmony
// @test-platform-reason: this port ships Prisma engine binaries built for the OpenHarmony host.
// @test-dependency: prisma@5.1.1=npm:@ohos-npm-ports/prisma@5.1.1-1
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process'),{join}=require('node:path'); const engines=require('@prisma/engines');
assert.equal(fs.existsSync(engines.schemaEngineBinaryPath),true);assert.equal(fs.existsSync(engines.queryEngineLibraryPath),true);
fs.writeFileSync('schema.prisma', `datasource db {
  provider = "sqlite"
  url = "file:./test.db"
}
`); const bin=join('node_modules','.bin',process.platform==='win32'?'prisma.cmd':'prisma');
const r=spawnSync(bin,['validate','--schema','schema.prisma'],{encoding:'utf8',shell:process.platform==='win32'});assert.equal(r.status,0,r.stderr||r.stdout);

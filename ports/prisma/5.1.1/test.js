// @test-package: prisma
// @test-dependency: @prisma/engines@5.1.1=npm:@ohos-npm-ports/prisma-engines@5.1.1-3
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process'),{join}=require('node:path');
fs.writeFileSync('schema.prisma', `generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "sqlite"
  url = "file:./test.db"
}
model Item {
  id Int @id @default(autoincrement())
  name String
}
`);
const bin=join('node_modules','.bin',process.platform==='win32'?'prisma.cmd':'prisma'),r=spawnSync(bin,['validate','--schema','schema.prisma'],{encoding:'utf8',shell:process.platform==='win32'});
assert.equal(r.status,0,r.stderr||r.stdout); assert.match(String(r.stdout)+'\n'+String(r.stderr),/valid|schema/i);

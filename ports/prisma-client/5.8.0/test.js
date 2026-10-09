// @test-package: @prisma/client
// @test-dependency: prisma@5.1.1=npm:@ohos-npm-ports/prisma@5.1.1-1
// @test-dependency: @prisma/engines@5.1.1=npm:@ohos-npm-ports/prisma-engines@5.1.1-3;platforms=openharmony
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process'),{join}=require('node:path');
(async()=>{const dir=join(process.cwd(),'prisma-smoke');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(join(dir,'schema.prisma'), `generator client {
  provider = "prisma-client-js"
  output = "./client"
}
datasource db {
  provider = "sqlite"
  url = "file:./test.db"
}
model Widget {
  id Int @id @default(autoincrement())
  name String
}
`);
const bin=join(process.cwd(),'node_modules','.bin',process.platform==='win32'?'prisma.cmd':'prisma');for(const args of [['db','push','--schema',join(dir,'schema.prisma'),'--skip-generate'],['generate','--schema',join(dir,'schema.prisma')]]){const r=spawnSync(bin,args,{cwd:dir,encoding:'utf8',shell:process.platform==='win32'});assert.equal(r.status,0,r.stderr||r.stdout);}
const {PrismaClient}=require(join(dir,'client')),client=new PrismaClient(),row=await client.widget.create({data:{name:'consumer'}});assert.equal((await client.widget.findUnique({where:{id:row.id}})).name,'consumer');await client.$disconnect();})().catch(e=>{console.error(e);process.exitCode=1;});

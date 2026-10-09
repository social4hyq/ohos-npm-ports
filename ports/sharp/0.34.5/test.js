// @test-package: sharp
const assert=require('node:assert/strict'),sharp=require('sharp');
(async()=>{const out=await sharp({create:{width:4,height:3,channels:3,background:{r:20,g:130,b:240}}}).resize(8,6).png().toBuffer({resolveWithObject:true});assert.equal(out.info.width,8);assert.equal(out.info.height,6);assert.equal(out.info.format,'png');assert.ok(out.data.length>8);})().catch(e=>{console.error(e);process.exitCode=1;});

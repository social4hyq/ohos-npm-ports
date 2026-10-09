// @test-package: @datadog/pprof
const assert=require('node:assert/strict'); const {time}=require('@datadog/pprof');
assert.equal(typeof time.start,'function'); assert.equal(typeof time.stop,'function'); time.start({intervalMicros:1000,durationMillis:10000});
function hotLoop(){const end=Date.now()+250;let n=0;while(Date.now()<end)for(let i=0;i<1000;i++)n+=Math.sqrt(i);return n;}
hotLoop(); const profile=time.stop(); assert.ok(profile.sample.length>0); assert.ok(profile.stringTable.strings.includes('hotLoop'));

// @test-package: @datadog/pprof
import assert from 'node:assert/strict';
import pprof from '@datadog/pprof';
pprof.time.start({intervalMicros:1000,durationMillis:60000});
function hotLoop(){let n=0;const end=Date.now()+500;while(Date.now()<end) n+=Math.sqrt(Math.random());return n;}
hotLoop();
const profile=pprof.time.stop();
assert.ok(profile.sample.length>0);
assert.ok(profile.stringTable.strings.includes('hotLoop'));

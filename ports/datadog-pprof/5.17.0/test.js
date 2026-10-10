// @test-package: @datadog/pprof
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const { time, encodeSync } = (await import('@datadog/pprof')).default;
  function consumerHotLoop() {
    const end = Date.now() + 750;
    let total = 0;
    while (Date.now() < end) for (let i = 0; i < 1000; i++) total += Math.sqrt(i);
    return total;
  }
  time.start({ intervalMicros: 1000, durationMillis: 60000 });
  let profile;
  try { assert.ok(consumerHotLoop() > 0); } finally { profile = time.stop(); }
  assert.ok(profile.sample.length > 0);
  assert.ok(profile.stringTable.strings.includes('consumerHotLoop'));
  assert.ok(encodeSync(profile).length > 0);
  tools.report({ sampled: true, encoded: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

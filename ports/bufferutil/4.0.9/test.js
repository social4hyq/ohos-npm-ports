// @test-package: bufferutil
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const { mask, unmask } = (await import('bufferutil')).default;
  const input = Buffer.from('registry-consumer-roundtrip');
  const key = Buffer.from([1, 7, 19, 31]);
  const output = Buffer.alloc(input.length);
  mask(input, key, output, 0, input.length);
  assert.notDeepEqual(input, output);
  unmask(output, key);
  assert.deepEqual(output, input);
  tools.report({ roundtrip: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

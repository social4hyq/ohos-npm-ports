// @test-package: yuku-core
import assert from 'node:assert/strict';

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const { load } = await import('yuku-core');
  const binding = load();
  assert.ok(binding && typeof binding === 'object');
  tools.report({ binding: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

// @test-package: @opentui/core-openharmony-arm64
// @test-role: support
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const local = createRequire(tools.packageRoot('@opentui/core') + '/package.json');
  const slot = '@opentui/core-openharmony-arm64';
  if (process.platform === 'openharmony') {
    const manifest = JSON.parse(fs.readFileSync(tools.packageRoot(slot, local) + '/package.json'));
    assert.deepEqual(manifest.os, ['openharmony']);
    assert.deepEqual(manifest.cpu, ['arm64']);
  } else {
    assert.throws(() => tools.packageRoot(slot, local), { code: 'MODULE_NOT_FOUND' });
  }
  tools.report({ platformSelection: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

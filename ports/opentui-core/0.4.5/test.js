// @test-package: @opentui/core
// @test-prerequisite: ports/bun/1.4.2
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const output = tools.bunScript(String.raw`
    import assert from 'node:assert/strict';
    import { createTestRenderer } from '@opentui/core/testing';
    import { BoxRenderable } from '@opentui/core';
    const setup = await createTestRenderer({ width: 30, height: 10 });
    try {
      const box = new BoxRenderable(setup.renderer, { width: 20, height: 3, border: true, title: 'consumer' });
      setup.renderer.root.add(box);
      await setup.renderOnce();
      assert.ok(setup.captureCharFrame().includes('consumer'));
      console.log('native-render-ready');
    } finally { await setup.renderer.destroy(); }
  `);
  assert.match(output.stdout, /native-render-ready/);
  tools.report({ nativeRender: true, frame: true, destroyed: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

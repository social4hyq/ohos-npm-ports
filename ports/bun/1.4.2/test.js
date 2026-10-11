// @test-package: bun
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const output = tools.bunScript(String.raw`
    import assert from 'node:assert/strict';
    const hash = new Bun.CryptoHasher('sha256').update('consumer').digest('hex');
    assert.equal(hash.length, 64);
    assert.equal(await Bun.file(import.meta.path).exists(), true);
    await Bun.write('.bun-source/app.js', "console.log('compiled-answer=' + (40 + 2));");
    const built = await Bun.build({ entrypoints: ['.bun-source/app.js'], target: 'bun', outdir: '.bun-build' });
    assert.equal(built.success, true);
    const compiled = Bun.spawn([process.execPath, built.outputs[0].path], { stdout: 'pipe', stderr: 'pipe' });
    assert.equal(await compiled.exited, 0);
    assert.match(await new Response(compiled.stdout).text(), /compiled-answer=42/);
    console.log('runtime-build-ready');
  `);
  assert.match(output.stdout, /runtime-build-ready/);
  tools.report({ runtime: true, build: true, hash: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

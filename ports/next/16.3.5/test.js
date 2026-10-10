// @test-package: next
// @test-timeout: 1800
// @test-project: next-react
// @test-fixture: test-fixture
// @test-prerequisite: ports/lightningcss/1.33.0
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const local = createRequire(require.resolve('next/dist/build/swc'));
  if (process.platform === 'openharmony') {
    const slot = local('@ohos-npm-ports/next-swc-openharmony-arm64/package.json');
    assert.deepEqual(slot.os, ['openharmony']);
    assert.deepEqual(slot.cpu, ['arm64']);
  } else {
    const abi = process.platform === 'linux' ? '-gnu' : process.platform === 'win32' ? '-msvc' : '';
    assert.ok(fs.existsSync(local.resolve(`@next/swc-${process.platform}-${process.arch}${abi}`)));
    assert.throws(() => local.resolve('@ohos-npm-ports/next-swc-openharmony-arm64'), { code: 'MODULE_NOT_FOUND' });
  }
  const binding = await require('next/dist/build/swc').loadBindings();
  assert.equal(binding.isWasm, false);
  const out = binding.transformSync('const answer: number = 42;', {
    filename: 'probe.ts', jsc: { parser: { syntax: 'typescript' } }, sourceMaps: false,
  });
  assert.match(out.code, /answer/);
  assert.doesNotMatch(out.code, /: number/);
  const css = (await import('lightningcss')).transform({ filename: 'test.css', code: Buffer.from('.app { color: red; }'), minify: true }).code;
  fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/port-test.css', css);
  const report = { result: { native: true, typescript: true }, assets: [] };
  if (process.env.PORT_TEST_PRIMARY === 'true') await (await import(process.env.PORT_TEST_FRONTEND_HELPER)).verifyFrontend(report);
  fs.writeFileSync(process.env.PORT_TEST_REPORT, JSON.stringify(report));
})().catch((error) => { console.error(error); process.exitCode = 1; });

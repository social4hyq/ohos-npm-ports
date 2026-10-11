// @test-package: lightningcss
// @test-project: react-assets
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
(async () => {

  const local = createRequire(require.resolve('lightningcss'));
  if (process.platform !== 'openharmony') {
    const abi = process.platform === 'linux' ? '-gnu' : process.platform === 'win32' ? '-msvc' : '';
    assert.ok(fs.existsSync(local.resolve(`lightningcss-${process.platform}-${process.arch}${abi}`)));
  }
  const { code } = (await import('lightningcss')).transform({
    filename: 'probe.css', code: Buffer.from('.app { display: flex; color: #ff0000; padding: 12px; }'), minify: true,
  });
  const css = code.toString();
  assert.match(css, /\.app\{/);
  assert.match(css, /color:red/);
  fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync(path.join('public', 'port-test.css'), code);
  const report = {
    result: { css }, assets: [{ path: '/port-test.css', includes: '.app{' }],
  };
  if (process.env.PORT_TEST_PRIMARY === "true") {
    await (await import(process.env.PORT_TEST_FRONTEND_HELPER)).verifyFrontend(report);
  }
  fs.writeFileSync(process.env.PORT_TEST_REPORT, JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });

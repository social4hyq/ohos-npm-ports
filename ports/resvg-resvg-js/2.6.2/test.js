// @test-package: @resvg/resvg-js
// @test-project: react-assets
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
(async () => {
  const { Resvg } = (await import('@resvg/resvg-js')).default;

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#ff0000"/></svg>';
  const rendered = new Resvg(svg).render();
  const png = rendered.asPng();
  assert.equal(rendered.width, 20);
  assert.equal(rendered.height, 10);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/port-test.png', png);
  const report = {
    result: { width: rendered.width, height: rendered.height, png: true },
    assets: [{ path: '/port-test.png', magic: '89504e470d0a1a0a' }],
  };
  if (process.env.PORT_TEST_PRIMARY === "true") {
    await (await import(process.env.PORT_TEST_FRONTEND_HELPER)).verifyFrontend(report);
  }
  fs.writeFileSync(process.env.PORT_TEST_REPORT, JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });

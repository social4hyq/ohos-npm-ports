// @test-package: vite-plus
// @test-timeout: 1800
// @test-prerequisite: ports/lightningcss/1.33.0
// @test-prerequisite: ports/oxlint-tsgolint/7.0.2003
// @test-prerequisite: ports/yuku-core/0.19.0
import assert from 'node:assert/strict';
import fs from 'node:fs';

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  tools.write('index.html', '<html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>');
  tools.write('src/main.js', "document.getElementById('app').textContent = 'port-build-ready';");
  tools.cli('vite-plus', ['build'], { timeout: 600000 }, 'vp');
  assert.match(fs.readFileSync('dist/index.html', 'utf8'), /assets\//);
  const js = fs.readdirSync('dist/assets').filter((name) => name.endsWith('.js'));
  assert.ok(js.some((name) => fs.readFileSync('dist/assets/' + name, 'utf8').includes('port-build-ready')));
  tools.report({ production: true, javascript: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

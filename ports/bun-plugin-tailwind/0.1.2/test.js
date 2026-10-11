// @test-package: bun-plugin-tailwind
// @test-prerequisite: ports/bun/1.4.2
// @test-fixture: test-fixture
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  tools.write('src/styles.css', '@import "tailwindcss";');
  tools.write('src/app.js', "import './styles.css'; console.log('flex p-4 text-red-500');");
  const output = tools.bunScript(String.raw`
    import assert from 'node:assert/strict';
    import plugin from 'bun-plugin-tailwind';
    const built = await Bun.build({ entrypoints: ['src/app.js'], outdir: '.plugin-build', plugins: [plugin] });
    assert.equal(built.success, true, JSON.stringify(built.logs));
    const cssFiles = built.outputs.filter((output) => output.path.endsWith('.css'));
    assert.ok(cssFiles.length > 0);
    const css = (await Promise.all(cssFiles.map((output) => output.text()))).join('\n');
    assert.match(css, /display:\s*flex/);
    assert.match(css, /\.p-4/);
    console.log('plugin-css-ready');
  `);
  assert.match(output.stdout, /plugin-css-ready/);
  tools.report({ pluginBuild: true, css: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

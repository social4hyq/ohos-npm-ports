// @test-package: turbo
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const pkg = JSON.parse(fs.readFileSync('package.json'));
  pkg.packageManager = 'npm@11.0.0';
  pkg.workspaces = ['packages/*'];
  fs.writeFileSync('package.json', JSON.stringify(pkg));
  tools.write('turbo.json', JSON.stringify({ tasks: { build: { outputs: ['dist/**'] } } }));
  tools.write('packages/app/package.json', JSON.stringify({ name: 'app', version: '1.0.0', scripts: { build: 'node build.cjs' } }));
  tools.write('packages/app/build.cjs', "require('node:fs').mkdirSync('dist',{recursive:true});require('node:fs').writeFileSync('dist/result.txt','task-ready')");
  tools.command(process.execPath, [process.env.PORT_TEST_NPM_CLI, 'install', '--no-audit', '--no-fund']);
  tools.cli('turbo', ['run', 'build']);
  assert.equal(fs.readFileSync('packages/app/dist/result.txt', 'utf8'), 'task-ready');
  const second = tools.cli('turbo', ['run', 'build']);
  assert.match(second.output, /FULL TURBO|cache hit/);
  tools.report({ task: true, cache: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

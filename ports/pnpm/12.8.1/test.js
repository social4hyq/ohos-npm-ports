// @test-package: pnpm
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  tools.write('package-source/package.json', JSON.stringify({ name: 'local-library', version: '1.0.0', main: 'index.cjs' }));
  tools.write('package-source/index.cjs', 'module.exports = 42;');
  tools.command(process.execPath, [process.env.PORT_TEST_NPM_CLI, 'pack', './package-source', '--pack-destination', '.']);
  tools.write('pnpm-project/package.json', JSON.stringify({ name: 'pnpm-app', private: true, dependencies: { 'local-library': 'file:../local-library-1.0.0.tgz' } }));
  const cwd = path.resolve('pnpm-project');
  const exe = path.join(tools.packageRoot('pnpm'), 'bin/pnpm.mjs');
  tools.command(process.execPath, [exe, 'install'], { cwd });
  assert.ok(fs.existsSync('pnpm-project/pnpm-lock.yaml'));
  const consumer = require('node:module').createRequire(path.join(cwd, 'package.json'));
  assert.equal(consumer('local-library'), 42);
  tools.command(process.execPath, [exe, 'install', '--frozen-lockfile'], { cwd });
  tools.report({ install: true, execute: 42, frozen: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

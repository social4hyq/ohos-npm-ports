// @test-package: @tailwindcss/oxide
// @test-fixture: test-fixture
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const { Scanner } = (await import('@tailwindcss/oxide')).default;
  const scanner = new Scanner({ sources: [] });
  const candidates = scanner.scanFiles([{ content: '<div class="flex text-red-500 p-4"></div>', extension: 'html' }]);
  for (const name of ['flex', 'text-red-500', 'p-4']) assert.ok(candidates.includes(name));
  const { compile } = await import('tailwindcss');
  const compiler = await compile('@tailwind utilities;');
  const css = compiler.build(candidates);
  assert.match(css, /display:\s*flex/);
  tools.report({ scanned: true, generated: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

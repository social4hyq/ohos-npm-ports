// @test-package: oxlint-tsgolint
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  tools.write('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, types: [] } }));
  tools.write('probe.ts', 'const n = 1 as unknown as string | undefined;');
  const result = tools.cli('oxlint-tsgolint', ['-tsconfig', 'tsconfig.json', 'probe.ts'], { codes: [0, 1] }, 'tsgolint');
  assert.match(result.output, /no-unsafe-type-assertion/);
  tools.report({ diagnostic: 'no-unsafe-type-assertion' });
})().catch((error) => { console.error(error); process.exitCode = 1; });

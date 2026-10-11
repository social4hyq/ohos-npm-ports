// @test-package: @typescript/native-preview
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  tools.write('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [] }, files: ['probe.ts'] }));
  tools.write('probe.ts', 'const answer: number = 42;');
  tools.cli('@typescript/native-preview', ['--project', 'tsconfig.json'], {}, 'tsgo');
  tools.write('probe.ts', 'const answer: number = "wrong";');
  const invalid = tools.cli('@typescript/native-preview', ['--project', 'tsconfig.json'], { codes: [1, 2] }, 'tsgo');
  assert.match(invalid.output, /TS2322/);
  tools.report({ valid: true, invalid: 'TS2322' });
})().catch((error) => { console.error(error); process.exitCode = 1; });

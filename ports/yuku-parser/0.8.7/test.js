// @test-package: yuku-parser
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const { parse } = (await import('yuku-parser'));
  const parsed = parse('const answer = 40 + 2;');
  assert.equal(parsed.diagnostics.length, 0);
  assert.equal(parsed.program.type, 'Program');
  const declaration = parsed.program.body[0].declarations[0];
  assert.equal(declaration.id.name, 'answer');
  assert.equal(declaration.init.type, 'BinaryExpression');
  assert.ok(parse('const = ;').diagnostics.length > 0);
  tools.report({ ast: true, diagnostics: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

// @test-package: yuku-codegen
// @test-prerequisite: ports/yuku-parser/0.9.3
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const { parse } = (await import('yuku-parser'));
  const { generate } = (await import('yuku-codegen'));
  const ast = parse('globalThis.consumerAnswer = 40 + 2;');
  assert.equal(ast.diagnostics.length, 0);
  const generated = generate(ast.program);
  assert.equal(generated.errors.length, 0);
  assert.equal(parse(generated.code).diagnostics.length, 0);
  const context = {};
  require('node:vm').runInNewContext(generated.code, context);
  assert.equal(context.consumerAnswer, 42);
  tools.report({ generated: true, reparsed: true, answer: 42 });
})().catch((error) => { console.error(error); process.exitCode = 1; });

// @test-package: yuku-codegen
// @test-dependency: yuku-parser@0.8.3=npm:@ohos-npm-ports/yuku-parser@0.8.3-1
const assert = require('node:assert/strict');
(async () => {
  const { parse } = await import('yuku-parser');
  const { print } = await import('yuku-codegen');
  const { program, diagnostics } = parse('const answer = 42;');
  assert.equal(diagnostics.length, 0);
  const result = print(program);
  assert.match(result.code, /const\s+answer\s*=\s*42/);
  assert.deepEqual(result.errors, []);
})().catch((error) => { console.error(error); process.exitCode = 1; });

// @test-package: @ast-grep/napi
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
(async () => {
  const { parse, Lang } = (await import('@ast-grep/napi')).default;

  const root = parse(Lang.JavaScript, 'const answer = 42;').root();
  const declaration = root.find('const $NAME = $VALUE');
  assert.ok(declaration, 'Native AST pattern must match');
  const identifier = declaration.getMatch('NAME').text();
  const value = declaration.getMatch('VALUE').text();
  assert.equal(identifier, 'answer');
  assert.equal(value, '42');
  assert.equal(root.find('let notPresent = $VALUE'), null);
  const report = { result: { identifier, value }, assets: [] };
  fs.writeFileSync(process.env.PORT_TEST_REPORT, JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });

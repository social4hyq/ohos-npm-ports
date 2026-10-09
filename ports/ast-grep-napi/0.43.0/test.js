// @test-package: @ast-grep/napi
const assert=require('node:assert/strict'); const {parse}=require('@ast-grep/napi');
const root=parse('js','const answer = 42;').root(); const declaration=root.find('const $NAME = $VALUE');
assert.ok(declaration); assert.equal(declaration.getMatch('NAME').text(),'answer'); assert.equal(declaration.getMatch('VALUE').text(),'42');

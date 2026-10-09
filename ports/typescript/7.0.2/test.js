const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

require('node:fs').writeFileSync('valid.ts', 'const answer: number = 42;\n');
require('node:fs').writeFileSync('invalid.ts', 'const answer: number = "wrong";\n');
const bin = join('node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const result = spawnSync(bin, ['--strict', '--noEmit', 'valid.ts'], { encoding: 'utf8', shell: process.platform === 'win32' });
assert.equal(result.status, 0, result.stderr || result.stdout);
const invalid = spawnSync(bin, ['--strict', '--noEmit', 'invalid.ts'], { encoding: 'utf8', shell: process.platform === 'win32' });
assert.notEqual(invalid.status, 0, 'tsc should reject an invalid assignment');
assert.match(`${invalid.stdout}\n${invalid.stderr}`, /error TS2322/);

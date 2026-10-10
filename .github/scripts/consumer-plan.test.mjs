import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { closure, testSpec } from './consumer-plan.mjs';
const plan = (file) => Object.fromEntries(execFileSync(process.execPath, ['.github/scripts/consumer-plan.mjs'], { input: `${file}\n`, encoding: 'utf8' }).trim().split('\n').map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
test('infrastructure selects every primary and build directory', () => {
  const value = plan('.github/fixtures/consumer/test-tools.mjs');
  const directories = readdirSync('ports').flatMap((port) => readdirSync(`ports/${port}`).map((version) => `ports/${port}/${version}`)).filter((dir) => existsSync(`${dir}/build.sh`));
  assert.deepEqual(new Set(JSON.parse(value.matrix)), new Set(directories));
  assert.deepEqual(new Set(JSON.parse(value['consumer-ports'])), new Set(directories.filter((dir) => testSpec(dir).role === 'primary')));
  for (const dir of JSON.parse(value.matrix)) assert.ok(testSpec(dir));
  assert.ok(JSON.parse(value['consumer-ports']).includes('ports/next/16.3.5'));
});
test('slot change selects its parent, never a standalone slot job', () => {
  const value = plan('ports/parcel-watcher-openharmony-arm64/2.5.1/test.js');
  assert.deepEqual(JSON.parse(value['consumer-ports']), ['ports/parcel-watcher/2.5.1']);
  assert.equal(testSpec('ports/parcel-watcher-openharmony-arm64/2.5.1').role, 'support');
});
test('paired parser and codegen keep the same upstream version', () => {
  const value = plan('ports/yuku-parser/0.5.44/test.js');
  assert.deepEqual(JSON.parse(value['consumer-ports']).sort(), ['ports/yuku-codegen/0.5.44', 'ports/yuku-parser/0.5.44']);
});
test('Prisma dependency cycle terminates and includes both artifacts', () => {
  assert.deepEqual(new Set(closure(['ports/prisma/5.1.1'])), new Set(['ports/prisma/5.1.1', 'ports/prisma-engines/5.1.1']));
});
test('default Node, optional frontend, browser and test timeouts', () => {
  assert.equal(testSpec('ports/sharp/0.34.5').setup, true);
  assert.equal(testSpec('ports/yuku-parser/0.10.2').setup, false);
  assert.equal(testSpec('ports/yuku-parser/0.10.2').format, 'esm');
  assert.equal(testSpec('ports/yuku-parser/0.10.2').project, 'node');
  assert.equal(testSpec('ports/lightningcss/1.32.0').project, 'react-assets');
  assert.equal(testSpec('ports/playwright-core/1.62.1').browser, 'chromium');
  assert.equal(testSpec('ports/next/14.2.28').timeout, 1800);
});

test('debug selection is explicit and rejects support roots', () => {
  const env = { ...process.env, CONSUMER_SELECTION: JSON.stringify(['ports/next/16.3.5']) };
  const value = execFileSync(process.execPath, ['.github/scripts/consumer-plan.mjs'], { input: '.github/scripts/consumer-plan.mjs\n', env, encoding: 'utf8' });
  assert.ok(value.includes('consumer-ports=["ports/next/16.3.5"]'));
  assert.throws(() => execFileSync(process.execPath, ['.github/scripts/consumer-plan.mjs'], { input: '', env: { ...env, CONSUMER_SELECTION: '["ports/parcel-watcher-openharmony-arm64/2.5.1"]' }, stdio: ['pipe', 'pipe', 'pipe'] }));
});

test('every declared test parses in its selected module format', () => {
  const directories = readdirSync('ports').flatMap((port) => readdirSync(`ports/${port}`).map((version) => `ports/${port}/${version}`)).filter((dir) => existsSync(`${dir}/build.sh`));
  for (const dir of directories) {
    const spec = testSpec(dir);
    execFileSync(process.execPath, ['--input-type', spec.format === 'esm' ? 'module' : 'commonjs', '--check'], { input: readFileSync(spec.file), stdio: ['pipe', 'pipe', 'pipe'] });
  }
});

test('temporary publishing and artifact upload apply to every build event', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  for (const label of ['Validate publish through temporary Verdaccio', 'Upload exact pre-release packages']) {
    const start = workflow.indexOf(`      - name: ${label}`);
    const end = workflow.indexOf('\n      - ', start + 1);
    assert.ok(start >= 0);
    assert.doesNotMatch(workflow.slice(start, end), /if: github.event_name/);
  }
});

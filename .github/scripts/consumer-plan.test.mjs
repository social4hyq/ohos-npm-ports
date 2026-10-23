import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
const has = (dir) => existsSync(`${dir}/test.js`);
import { closure, infrastructure, isInfrastructure, testSpec } from './consumer-plan.mjs';
const plan = (file) => Object.fromEntries(execFileSync(process.execPath, ['.github/scripts/consumer-plan.mjs'], { input: `${file}\n`, encoding: 'utf8' }).trim().split('\n').map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
test('infrastructure selects every primary and build directory', () => {
  const value = plan('.github/fixtures/consumer/test-tools.mjs');
  const directories = readdirSync('ports').flatMap((port) => readdirSync(`ports/${port}`).map((version) => `ports/${port}/${version}`)).filter((dir) => existsSync(`${dir}/build.sh`));
  const primaries = directories.filter((dir) => testSpec(dir)?.role === 'primary');
  assert.deepEqual(new Set(JSON.parse(value.matrix)), new Set(closure(primaries)));
  assert.deepEqual(new Set(JSON.parse(value['consumer-ports'])), new Set(directories.filter((dir) => testSpec(dir)?.role === 'primary')));
  if (has('ports/next/16.3.5')) assert.ok(JSON.parse(value['consumer-ports']).includes('ports/next/16.3.5'));
});
test('slot change selects its parent, never a standalone slot job', { skip: !has('ports/parcel-watcher/2.5.1') || !has('ports/parcel-watcher-openharmony-arm64/2.5.1') }, () => {
  const value = plan('ports/parcel-watcher-openharmony-arm64/2.5.1/test.js');
  assert.deepEqual(JSON.parse(value['consumer-ports']), ['ports/parcel-watcher/2.5.1']);
  assert.equal(testSpec('ports/parcel-watcher-openharmony-arm64/2.5.1').role, 'support');
});
test('paired parser and codegen keep the same upstream version', { skip: !has('ports/yuku-codegen/0.5.44') || !has('ports/yuku-parser/0.5.44') }, () => {
  const value = plan('ports/yuku-parser/0.5.44/test.js');
  assert.deepEqual(JSON.parse(value['consumer-ports']).sort(), ['ports/yuku-codegen/0.5.44', 'ports/yuku-parser/0.5.44']);
});
test('Prisma dependency cycle terminates and includes both artifacts', { skip: !has('ports/prisma/5.1.1') || !has('ports/prisma-engines/5.1.1') }, () => {
  assert.deepEqual(new Set(closure(['ports/prisma/5.1.1'])), new Set(['ports/prisma/5.1.1', 'ports/prisma-engines/5.1.1']));
});
test('default Node, optional frontend, browser and test timeouts', { skip: ['sharp/0.34.5', 'yuku-parser/0.10.2', 'lightningcss/1.32.0', 'playwright-core/1.62.1', 'next/14.2.28'].some((dir) => !has(`ports/${dir}`)) }, () => {
  assert.equal(testSpec('ports/sharp/0.34.5').setup, true);
  assert.equal(testSpec('ports/yuku-parser/0.10.2').setup, false);
  assert.equal(testSpec('ports/yuku-parser/0.10.2').format, 'esm');
  assert.equal(testSpec('ports/yuku-parser/0.10.2').project, 'node');
  assert.equal(testSpec('ports/lightningcss/1.32.0').project, 'react-assets');
  assert.equal(testSpec('ports/playwright-core/1.62.1').browser, 'chromium');
  assert.equal(testSpec('ports/next/14.2.28').timeout, 1800);
});

test('debug selection is explicit and rejects support roots', { skip: !has('ports/next/16.3.5') || !has('ports/parcel-watcher-openharmony-arm64/2.5.1') }, () => {
  const env = { ...process.env, CONSUMER_SELECTION: JSON.stringify(['ports/next/16.3.5']) };
  const value = execFileSync(process.execPath, ['.github/scripts/consumer-plan.mjs'], { input: '.github/scripts/consumer-plan.mjs\n', env, encoding: 'utf8' });
  assert.ok(value.includes('consumer-ports=["ports/next/16.3.5"]'));
  assert.throws(() => execFileSync(process.execPath, ['.github/scripts/consumer-plan.mjs'], { input: '', env: { ...env, CONSUMER_SELECTION: '["ports/parcel-watcher-openharmony-arm64/2.5.1"]' }, stdio: ['pipe', 'pipe', 'pipe'] }));
});

test('every declared test parses in its selected module format', () => {
  const directories = readdirSync('ports').flatMap((port) => readdirSync(`ports/${port}`).map((version) => `ports/${port}/${version}`)).filter((dir) => existsSync(`${dir}/build.sh`));
  for (const dir of directories) {
    const spec = testSpec(dir);
    if (!spec) continue;
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

test('workflow path filter matches the infrastructure list', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const block = workflow.slice(workflow.indexOf('  pull_request:'), workflow.indexOf('\npermissions:'));
  const paths = [...block.matchAll(/^      - "(.+)"$/gm)].map((match) => match[1]).filter((path) => path !== 'ports/**');
  const expected = infrastructure.map((entry) => entry.endsWith('/') ? `${entry}**` : entry);
  assert.deepEqual(new Set(paths), new Set(expected));
  for (const entry of infrastructure) assert.ok(entry.endsWith('/') || existsSync(entry), `Missing infrastructure file: ${entry}`);
});

test('documentation edits never select the full matrix', () => {
  assert.equal(isInfrastructure('.github/fixtures/consumer/README.md'), false);
  assert.equal(isInfrastructure('.github/fixtures/consumer/tool-versions.json'), true);
  assert.equal(isInfrastructure('.github/scripts/ci-time-service-compat.sh'), true);
  assert.equal(plan('.github/fixtures/consumer/README.md')['consumer-enabled'], 'false');
});

test('consumer tool versions are exact', () => {
  const versions = JSON.parse(readFileSync('.github/fixtures/consumer/tool-versions.json', 'utf8'));
  for (const [name, version] of Object.entries(versions)) assert.match(version, /^\d+\.\d+\.\d+$/, name);
});

test('every OS has its own consumer job below the matrix limit', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.doesNotMatch(workflow, /^\s+target:$/m);
  for (const target of ['win32-x64', 'linux-arm64', 'linux-x64', 'darwin-arm64', 'openharmony-arm64']) assert.ok(workflow.includes(`, ${target})`), target);
});

test('only pull_request runs share a concurrency group', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const block = workflow.slice(workflow.indexOf('\nconcurrency:'), workflow.indexOf('\njobs:'));
  assert.match(block, /github\.run_id/);
  assert.match(block, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.doesNotMatch(block, /github\.ref\b/);
});

test('lightningcss changes do not select the independent Next consumer', { skip: !has('ports/lightningcss/1.32.0') || !has('ports/next/14.2.28') }, () => {
  const value = plan('ports/lightningcss/1.32.0/build.sh');
  assert.ok(!JSON.parse(value.matrix).includes('ports/next/14.2.28'));
  assert.ok(!JSON.parse(value['consumer-ports']).includes('ports/next/14.2.28'));
  assert.deepEqual(testSpec('ports/next/14.2.28').prerequisites, []);
  assert.ok(testSpec('ports/next/14.2.28').fixture.endsWith('/.github/fixtures/consumer/projects/next-react'));
});

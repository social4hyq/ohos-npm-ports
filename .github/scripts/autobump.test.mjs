import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compareVersions, satisfiesCaret, highestVersion, rewriteText, bumpPort, planPorts, groupPlan, selectTarget, installTestTemplate } from './autobump.mjs';

const info = (latest, versions = [latest], tags = {}) => ({ tags: { latest, ...tags }, versions });

const cfg = (ports) => ({ ports });
const tree = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'autobump-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync('git',['init','-q'],{cwd:root});
  execFileSync('git',['add','ports'],{cwd:root});
  return root;
};

test('compareVersions handles numeric order, long patch numbers and prereleases', () => {
  assert.ok(compareVersions('0.6.10', '0.6.9') > 0);
  assert.ok(compareVersions('7.0.2003', '7.0.2001') > 0);
  assert.ok(compareVersions('1.0.0', '1.0.0-rc.1') > 0);
  assert.ok(compareVersions('7.0.0-dev.20260707.2', '7.0.0-dev.20260707.10') < 0);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
});

test('satisfiesCaret follows npm caret rules including 0.x', () => {
  assert.ok(satisfiesCaret('4.1.0', '4.0.9'));
  assert.ok(!satisfiesCaret('6.0.1', '5.1.7'));
  assert.ok(satisfiesCaret('0.6.8', '0.6.6'));
  assert.ok(!satisfiesCaret('0.7.0', '0.6.6'));
  assert.ok(satisfiesCaret('0.0.5', '0.0.5'));
  assert.ok(!satisfiesCaret('0.0.6', '0.0.5'));
  assert.ok(!satisfiesCaret('4.0.8', '4.0.9'));
});

test('highestVersion picks the semver maximum directory', () => {
  assert.equal(highestVersion(['0.4.5', '0.6.6', '0.5.8', '0.10.2']), '0.10.2');
  assert.equal(highestVersion([]), null);
});

test('rewriteText resets revision to -1 and respects numeric boundaries', () => {
  const out = rewriteText('v0.6.6 0.6.6-3 "0.6.60" 10.6.6 bufferutil-0.6.6.tgz', '0.6.6', '0.6.8');
  assert.equal(out, 'v0.6.8 0.6.8-1 "0.6.60" 10.6.6 bufferutil-0.6.8.tgz');
});

test('rewriteText leaves four-segment versions alone but still rewrites sentence-final versions', () => {
  assert.equal(rewriteText('lib 0.6.6.1 and 1.0.6.6 and see 0.6.6.', '0.6.6', '0.6.8'), 'lib 0.6.6.1 and 1.0.6.6 and see 0.6.8.');
});

test('bumpPort copies the highest dir, rewrites it, and keeps the old dir', () => {
  const root = tree({
    'ports/foo/1.2.3/build.sh': '#!/bin/sh\nset -e\ncurl -fsSL https://x/foo-1.2.3.tgz\n',
    'ports/foo/1.2.3/publish.sh': '#!/bin/sh\nset -e\ncd foo-1.2.3\nnpm publish --tag latest --access public\n',
    'ports/foo/1.2.3/patchs/0001-update-package-json.patch': '-  "version": "1.2.3",\n+  "version": "1.2.3-4",\n',
  });
  const changed = bumpPort(root, 'foo', '1.2.3', '1.3.0');
  assert.deepEqual(readdirSync(join(root, 'ports/foo')).sort(), ['1.2.3', '1.3.0']);
  assert.match(readFileSync(join(root, 'ports/foo/1.3.0/build.sh'), 'utf8'), /foo-1\.3\.0\.tgz/);
  assert.match(readFileSync(join(root, 'ports/foo/1.3.0/patchs/0001-update-package-json.patch'), 'utf8'), /"version": "1\.2\.3-4"/);
  assert.match(readFileSync(join(root, 'ports/foo/1.2.3/build.sh'), 'utf8'), /1\.2\.3/);
  assert.equal(changed.length, 2);
});

test('bumpPort refuses to leave residue or overwrite an existing dir', () => {
  const root = tree({
    'ports/foo/1.2.3/build.sh': '#!/bin/sh\necho 1.2.3\n',
    'ports/foo/1.2.3/publish.sh': '#!/bin/sh\ncd foo\n',
    'ports/bar/1.0.0/build.sh': 'echo 1.0.0\n',
    'ports/bar/1.0.1/build.sh': 'echo 1.0.1\n',
  });
  assert.throws(() => bumpPort(root, 'bar', '1.0.0', '1.0.1'), /already exists/);
  // 非法 shell 语法：改写后 sh -n 失败
  writeFileSync(join(root, 'ports/foo/1.2.3/build.sh'), 'if then\n# 1.2.3\n');
  assert.throws(() => bumpPort(root, 'foo', '1.2.3', '1.2.4'), /syntax/);
  assert.ok(!existsSync(join(root, 'ports/foo/1.2.4')), 'failed bump must clean up the new dir');
});

test('planPorts classifies bump / current / manual / hold / error', async () => {
  const root = tree({
    'ports/a/1.0.0/build.sh': '', 'ports/b/2.0.0/build.sh': '', 'ports/c/1.0.0/build.sh': '',
    'ports/d/1.0.0/build.sh': '', 'ports/f/1.0.0/build.sh': '', 'ports/e/1.0.0/build.sh': '', 'ports/e/1.1.0/build.sh': '',
  });
  const latest = { a: info('1.1.0'), b: info('2.0.0'), c: info('3.0.0'), e: info('1.1.0') };
  const rows = await planPorts(root, cfg({
    a: { npm: 'a' }, b: { npm: 'b' }, c: { npm: 'c' }, d: { npm: 'd' }, e: { npm: 'e' }, f: { npm: 'f', hold: 'maintainer asked' },
  }), async (name) => { if (!(name in latest)) throw new Error('404'); return latest[name]; });
  const by = Object.fromEntries(rows.map((r) => [r.port, r]));
  assert.equal(by.a.status, 'bump');
  assert.equal(by.a.to, '1.1.0');
  assert.equal(by.b.status, 'current');
  assert.equal(by.c.status, 'manual-major');
  assert.equal(by.d.status, 'error');
  assert.equal(by.e.status, 'current');
  assert.equal(by.f.status, 'hold');
});

test('groupPlan keeps a group atomic and names the branch', () => {
  const rows = [
    { port: 'x', group: 'g', status: 'bump', from: '0.6.6', to: '0.6.8' },
    { port: 'y', group: 'g', status: 'bump', from: '0.6.6', to: '0.6.8' },
    { port: 'p', status: 'bump', from: '4.0.9', to: '4.1.0' },
    { port: 'm', group: 'h', status: 'bump', from: '1.0.0', to: '1.1.0' },
    { port: 'n', group: 'h', status: 'error', from: '1.0.0' },
  ];
  const groups = groupPlan(rows);
  assert.deepEqual(groups.map((g) => g.branch), ['autobump/g-0.6.8', 'autobump/p-4.1.0']);
  assert.deepEqual(groups[0].members.map((m) => m.port), ['x', 'y']);
  assert.equal(rows.find((r) => r.port === 'm').status, 'group-incomplete');
});

test('reject unknown selection', async () => {
  await assert.rejects(() => planPorts('.', { ports: {} }, async () => info('1.0.0'), ['missing']), /unknown port/);
});

test('selection expands an entire group', async () => {
  const root = tree({'ports/a/1.0.0/build.sh':'', 'ports/b/1.0.0/build.sh':''});
  const rows = await planPorts(root, cfg({a:{npm:'a',group:'g'},b:{npm:'a',group:'g'}}), async ()=>info('1.1.0'), ['a']);
  assert.deepEqual(rows.map(r=>r.port), ['a','b']);
});

test('reject traversal and prerelease targets before copying', () => {
  assert.throws(()=>bumpPort('.', '../foo', '1.0.0','1.1.0'), /invalid/);
  assert.throws(()=>bumpPort('.', 'foo', '1.0.0','1.1.0-rc.1'), /invalid/);
});

test('code patches remain byte-identical and metadata patches require regeneration', () => {
  const patch = '- example 1.2.3\n+ changed 1.2.3\n';
  const root = tree({'ports/foo/1.2.3/build.sh':'echo 1.2.3\n','ports/foo/1.2.3/publish.sh':'echo 1.2.3\n','ports/foo/1.2.3/patchs/code.patch':patch});
  bumpPort(root, 'foo','1.2.3','1.2.4');
  assert.equal(readFileSync(join(root,'ports/foo/1.2.4/patchs/code.patch'),'utf8'),patch);
});


test('metadata delta preserves new upstream dependencies', async () => {
  const {applyDelta} = await import('./autobump.mjs');
  assert.deepEqual(applyDelta({version:'1.0.0',optionalDependencies:{a:'1.0.0'}},{version:'1.0.0-4',optionalDependencies:{a:'1.0.0',ohos:'1.0.0-4'}},{version:'1.1.0',optionalDependencies:{a:'1.1.0',new:'2.0.0'}},'1.0.0','1.1.0'), {version:'1.1.0-1',optionalDependencies:{a:'1.1.0',new:'2.0.0',ohos:'1.1.0-1'}});
});

test('only tracked recipe files are copied', () => {
  const root=tree({'ports/foo/1.0.0/build.sh':'echo 1.0.0\n','ports/foo/1.0.0/publish.sh':'echo 1.0.0\n'});
  writeFileSync(join(root,'ports/foo/1.0.0/local-secret'),'not tracked');
  bumpPort(root,'foo','1.0.0','1.1.0');
  assert.ok(!existsSync(join(root,'ports/foo/1.1.0/local-secret')));
});

test('unstable latest is reported rather than bumped', async () => {
  const root=tree({'ports/foo/1.0.0/build.sh':''});
  const rows=await planPorts(root,cfg({foo:{npm:'foo'}}),async ()=>info('1.1.0-rc.1', ['1.0.0','1.1.0-rc.1']));
  assert.equal(rows[0].status,'error');
  assert.deepEqual(groupPlan(rows),[]);
});

test('planPorts picks the highest stable version inside the caret range even when latest left the range', async () => {
  const root = tree({ 'ports/o/0.6.6/build.sh': '', 'ports/p/4.0.9/build.sh': '' });
  const rows = await planPorts(root, cfg({ o: { npm: 'o' }, p: { npm: 'p' } }), async (name) => name === 'o'
    ? info('0.7.0', ['0.6.6', '0.6.7', '0.6.8', '0.6.9-rc.1', '0.7.0'])
    : info('5.0.0', ['4.0.9', '4.1.0', '4.2.0-beta.1', '5.0.0']));
  const by = Object.fromEntries(rows.map((r) => [r.port, r]));
  assert.deepEqual([by.o.status, by.o.to], ['bump', '0.6.8']);
  assert.match(by.o.note, /0\.7\.0/);
  assert.deepEqual([by.p.status, by.p.to], ['bump', '4.1.0']);
});

test('planPorts reports manual-major only when nothing newer exists inside the range', async () => {
  const root = tree({ 'ports/o/0.6.6/build.sh': '' });
  const rows = await planPorts(root, cfg({ o: { npm: 'o' } }), async () => info('0.7.0', ['0.6.6', '0.7.0']));
  assert.deepEqual([rows[0].status, rows[0].to], ['manual-major', '0.7.0']);
});

test('range * follows the named dist-tag, stable only; tag without range * is a config error', async () => {
  const root = tree({ 'ports/o/1.0.0/build.sh': '' });
  const meta = info('2.0.0', ['1.0.0', '1.5.0', '2.0.0', '3.0.0'], { next: '3.0.0', beta: '4.0.0-beta.1' });
  let rows = await planPorts(root, cfg({ o: { npm: 'o', range: '*' } }), async () => meta);
  assert.deepEqual([rows[0].status, rows[0].to], ['bump', '2.0.0']);
  rows = await planPorts(root, cfg({ o: { npm: 'o', range: '*', tag: 'next' } }), async () => meta);
  assert.equal(rows[0].to, '3.0.0');
  rows = await planPorts(root, cfg({ o: { npm: 'o', range: '*', tag: 'beta' } }), async () => meta);
  assert.equal(rows[0].status, 'error');
  await assert.rejects(() => planPorts(root, cfg({ o: { npm: 'o', tag: 'next' } }), async () => meta), /tag.*range/);
  await assert.rejects(() => planPorts(root, cfg({ o: { npm: 'o', range: '^1' } }), async () => meta), /range/);
});

test('selectTarget never returns a version at or below the current one', () => {
  assert.equal(selectTarget(info('1.0.0', ['0.9.0', '1.0.0']), '1.0.0', {}).to, '1.0.0');
  assert.equal(selectTarget(info('1.0.0', ['0.9.0', '1.0.0']), '1.0.0', {}).status, 'current');
});

test('group members share one target; diverging members fall back as a whole', async () => {
  const root = tree({ 'ports/a/0.6.6/build.sh': '', 'ports/b/0.6.6/build.sh': '', 'ports/c/0.5.8/build.sh': '', 'ports/d/0.6.6/build.sh': '' });
  const meta = info('0.7.0', ['0.5.8', '0.5.9', '0.6.6', '0.6.8', '0.7.0']);
  const rows = await planPorts(root, cfg({ a: { npm: 'x', group: 'g' }, b: { npm: 'x', group: 'g' }, c: { npm: 'x', group: 'h' }, d: { npm: 'x', group: 'h' } }), async () => meta);
  const groups = groupPlan(rows);
  assert.deepEqual(groups.map((g) => [g.key, g.to]), [['g', '0.6.8']]);
  assert.equal(rows.find((r) => r.port === 'c').status, 'group-incomplete');
});

test('changed list only contains files that were actually rewritten', () => {
  const root = tree({ 'ports/foo/1.0.0/build.sh': 'echo 1.0.0\n', 'ports/foo/1.0.0/publish.sh': 'echo hi\n' });
  assert.equal(bumpPort(root, 'foo', '1.0.0', '1.1.0').length, 1);
});

test('test templates are syntax checked and removed with the failed bump', () => {
  const root = tree({ 'ports/foo/1.0.0/build.sh': 'echo 1.0.0\n', 'ports/foo/1.0.0/publish.sh': 'echo 1.0.0\n' });
  mkdirSync(join(root, '.github/autobump-tests'), { recursive: true });
  mkdirSync(join(root, 'ports/foo/1.1.0'), { recursive: true });
  writeFileSync(join(root, '.github/autobump-tests/foo.js'), '// @test-package: foo\nimport x from \n');
  assert.throws(() => installTestTemplate(root, 'foo', '1.1.0'), /syntax/);
  writeFileSync(join(root, '.github/autobump-tests/foo.js'), "import x from 'foo';\n");
  assert.throws(() => installTestTemplate(root, 'foo', '1.1.0'), /@test-package/);
  writeFileSync(join(root, '.github/autobump-tests/foo.js'), "// @test-package: foo\nimport x from 'foo';\n");
  installTestTemplate(root, 'foo', '1.1.0');
  assert.ok(existsSync(join(root, 'ports/foo/1.1.0/test.js')));
});

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compareVersions, satisfiesCaret, highestVersion, rewriteText, bumpPort, planPorts, groupPlan } from './autobump.mjs';

const cfg = (ports) => ({ ports });
const tree = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'autobump-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
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

test('bumpPort copies the highest dir, rewrites it, and keeps the old dir', () => {
  const root = tree({
    'ports/foo/1.2.3/build.sh': '#!/bin/sh\nset -e\ncurl -fsSL https://x/foo-1.2.3.tgz\n',
    'ports/foo/1.2.3/publish.sh': '#!/bin/sh\nset -e\ncd foo-1.2.3\nnpm publish --tag latest --access public\n',
    'ports/foo/1.2.3/patchs/0001-update-package-json.patch': '-  "version": "1.2.3",\n+  "version": "1.2.3-4",\n',
  });
  const changed = bumpPort(root, 'foo', '1.2.3', '1.3.0');
  assert.deepEqual(readdirSync(join(root, 'ports/foo')).sort(), ['1.2.3', '1.3.0']);
  assert.match(readFileSync(join(root, 'ports/foo/1.3.0/build.sh'), 'utf8'), /foo-1\.3\.0\.tgz/);
  assert.match(readFileSync(join(root, 'ports/foo/1.3.0/patchs/0001-update-package-json.patch'), 'utf8'), /"version": "1\.3\.0-1"/);
  assert.match(readFileSync(join(root, 'ports/foo/1.2.3/build.sh'), 'utf8'), /1\.2\.3/);
  assert.equal(changed.length, 3);
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
  const latest = { a: '1.1.0', b: '2.0.0', c: '3.0.0', e: '1.1.0' };
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

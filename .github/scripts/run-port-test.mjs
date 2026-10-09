import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const { PACKAGE_NAME: packageName, PACKAGE_VERSION: packageVersion, TEST_FILE: testFile, PORT_TARBALL: tarball } = process.env;
if (!packageName || !packageVersion || !testFile) {
  throw new Error('Set packageName, packageVersion, and testFile');
}

const testSource = readFileSync(resolve(testFile), 'utf8');
const metadata = (key) => testSource.match(new RegExp(`^// @${key}:\\s*(.+)$`, 'm'))?.[1].trim();
const consumerName = metadata('test-package') ?? packageName;
const runtime = metadata('test-runtime') ?? 'node';
const supportedPlatforms = metadata('test-platforms')?.split(',').map((platform) => platform.trim());
const unsupportedReason = metadata('test-platform-reason');
const testDependencies = [...testSource.matchAll(/^\/\/ @test-dependency: (\S+)$/gm)]
  .map((match) => match[1])
  .filter((_, index) => {
    const platforms = testSource.match(new RegExp(`^// @test-dependency-platforms:\\s*(.+)$`, 'm'))?.[1].split(',').map((platform) => platform.trim());
    return !platforms || platforms.includes(process.platform);
  });
const upstreamVersion = basename(resolve(testFile, '..'));

if (!['node', 'bun'].includes(runtime)) throw new Error(`Unsupported test runtime: ${runtime}`);
if (supportedPlatforms && !supportedPlatforms.includes(process.platform)) {
  if (!unsupportedReason) throw new Error(`Platform restriction for ${testFile} must include @test-platform-reason`);
  console.log(`N/A on ${process.platform}: ${unsupportedReason}`);
  process.exit(0);
}

const cwd = mkdtempSync(join(process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? tmpdir(), 'ohos-port-test-'));
const fixture = join(cwd, 'fixture');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const exec = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) throw new Error(`${command} exited ${result.status ?? result.signal}`);
};

try {
  mkdirSync(fixture);
  const fixtureDependencies = { [consumerName]: upstreamVersion };
  const dependencyOverrides = {};
  for (const spec of testDependencies) {
    const [upstream, replacement] = spec.split('=');
    if (!replacement?.startsWith('npm:')) throw new Error(`Test dependency must use upstream=port alias syntax: ${spec}`);
    const at = upstream.startsWith('@') ? upstream.indexOf('@', upstream.indexOf('/') + 1) : upstream.indexOf('@');
    if (at < 1) throw new Error(`Test dependency must pin upstream name/version: ${spec}`);
    const name = upstream.slice(0, at);
    const version = upstream.slice(at + 1);
    if (name === consumerName) throw new Error(`Test dependency duplicates consumer package: ${name}`);
    fixtureDependencies[name] = version;
    dependencyOverrides[name] = replacement;
  }
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({
    name: 'ohos-port-override-test',
    version: '1.0.0',
    private: true,
    dependencies: { 'port-test-consumer': 'file:./fixture' },
    overrides: { [consumerName]: tarball ? `file:${resolve(tarball)}` : `npm:${packageName}@${packageVersion}`, ...dependencyOverrides },
  }));
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({
    name: 'port-test-consumer',
    version: '1.0.0',
    private: true,
    dependencies: fixtureDependencies,
  }));
  exec(npm, ['install', '--no-audit', '--no-fund']);
  if (process.platform === 'openharmony') {
    exec(npm, ['install', '--no-save', '--no-audit', '--no-fund', 'ohos-signpost']);
    exec(npm, ['exec', '--yes', '--', 'ohos-signpost']);
  }
  copyFileSync(resolve(testFile), join(cwd, 'test.js'));
  if (runtime === 'bun') {
    const localBun = join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'bun.cmd' : 'bun');
    exec(process.platform === 'openharmony' || testDependencies.some((spec) => spec.startsWith('bun@')) ? localBun : 'bun', ['test.js']);
  } else {
    exec(process.execPath, ['test.js']);
  }
} finally {
  rmSync(cwd, { recursive: true, force: true });
}

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { PACKAGE_NAME: packageName, PACKAGE_VERSION: packageVersion, TEST_FILE: testFile, PORT_TARBALL: tarball } = process.env;
if (!packageName || !packageVersion || !testFile) {
  throw new Error('Set packageName, packageVersion, and testFile');
}

const cwd = mkdtempSync(join(process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? tmpdir(), 'ohos-port-test-'));
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
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'ohos-port-consumer-test', version: '1.0.0', private: true }));
  const target = tarball ? resolve(tarball) : `${packageName}@${packageVersion}`;
  exec(npm, ['install', '--no-audit', '--no-fund', target]);
  if (process.platform === 'openharmony') {
    exec(npm, ['install', '--no-save', '--no-audit', '--no-fund', 'ohos-signpost']);
    exec(npm, ['exec', '--yes', '--', 'ohos-signpost']);
  }
  copyFileSync(resolve(testFile), join(cwd, 'test.js'));
  exec(process.execPath, ['test.js']);
} finally {
  rmSync(cwd, { recursive: true, force: true });
}

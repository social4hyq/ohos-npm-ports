import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { name, version, platformOnly, os: allowedOS, cpu: allowedCPU } = JSON.parse(process.env.PACKAGE_CASE);
const platform = process.platform;
const arch = process.arch;
const matches = (list, value) => !list?.length || list.includes('any') || list.includes(value);
const excluded = (list, value) => (list ?? []).some((entry) => entry.startsWith('!') && entry.slice(1) === value);
const supported = !excluded(allowedOS, platform) && !excluded(allowedCPU, arch) && matches(allowedOS, platform) && matches(allowedCPU, arch);

if (!supported) {
  if (!platformOnly) throw new Error(`${name}@${version} declares incompatible platform metadata on ${platform}/${arch}`);
  console.log(`N/A by package metadata: ${name}@${version} excludes ${platform}/${arch}; parent package owns cross-platform fallback tests.`);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'ohos-npm-ports-probe-'));
try {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, name: 'port-probe', version: '1.0.0' }));
  const install = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--foreground-scripts', `${name}@${version}`], {
    cwd: dir, stdio: 'inherit', env: process.env,
  });
  if (install.status !== 0) throw new Error(`npm install failed: ${install.status ?? install.signal}`);
  if (platform === 'openharmony') {
    // npm packages with native addons must be signed before loading on HarmonyOS.
    const sign = spawnSync('npx', ['--yes', 'ohos-signpost'], { cwd: dir, stdio: 'inherit' });
    if (sign.status !== 0) throw new Error(`ohos-signpost failed: ${sign.status ?? sign.signal}`);
  }
  const packageDir = join(dir, 'node_modules', ...name.split('/'));
  const pkgPath = join(packageDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bins = typeof pkg.bin === 'string' ? { [pkg.name.split('/').at(-1)]: pkg.bin } : (pkg.bin ?? {});
  if (Object.keys(bins).length) {
    for (const [bin, rel] of Object.entries(bins)) {
      const entry = join(dir, 'node_modules', '.bin', bin);
      const result = spawnSync(entry, ['--version'], { cwd: dir, encoding: 'utf8', timeout: 30000 });
      if (result.status !== 0) {
        // Some CLIs don't implement --version; help still exercises module loading and argument parsing.
        const help = spawnSync(entry, ['--help'], { cwd: dir, encoding: 'utf8', timeout: 30000 });
        if (help.status !== 0) throw new Error(`${bin} probe failed (version=${result.status}, help=${help.status})`);
      }
      console.log(`CLI probe passed: ${bin} (${rel})`);
    }
  } else {
    const exportRoot = pkg.exports?.['.'] ?? pkg.exports;
    const selectImport = (target) => {
      if (typeof target === 'string') return target;
      if (!target || typeof target !== 'object') return undefined;
      for (const key of ['node', 'import', 'default', 'require']) {
        const selected = selectImport(target[key]);
        if (selected) return selected;
      }
    };
    const entry = selectImport(exportRoot) ?? pkg.module ?? pkg.main ?? './index.js';
    const entryPath = join(packageDir, entry.replace(/^\.\//, ''));
    const probe = `const p=await import(${JSON.stringify(entryPath)}); if(p===undefined) throw Error('empty export'); console.log('module loaded')`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: dir, stdio: 'inherit', timeout: 30000 });
    if (result.status !== 0) throw new Error(`module load probe failed for ${name}@${version}: ${result.status ?? result.signal}`);
    console.log(`Module probe passed: ${name}@${version} (${entry})`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

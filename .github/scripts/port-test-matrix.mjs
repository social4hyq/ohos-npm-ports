import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const registry = 'https://registry.npmjs.org';
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const packages = [];
const { readFile } = await import('node:fs/promises');
for (const port of await readdir('ports', { withFileTypes: true })) {
  if (!port.isDirectory()) continue;
  for (const upstream of await readdir(join('ports', port.name), { withFileTypes: true })) {
    if (!upstream.isDirectory()) continue;
    const testFile = join('ports', port.name, upstream.name, 'test.js');
    try {
      await (await import('node:fs/promises')).access(testFile);
    } catch {
      continue;
    }

    const name = `@ohos-npm-ports/${port.name}`;
    const packument = await json(`${registry}/${encodeURIComponent(name)}`);
    const revision = new RegExp(`^${upstream.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
    const candidates = Object.keys(packument.versions ?? {})
      .map((version) => ({ version, match: version.match(revision) }))
      .filter(({ match }) => match)
      .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
    if (!candidates.length) {
      // A new port directory can have a test.js before its first npm publish.
      // Its build is covered by CI/build-and-publish; registry-based consumer
      // tests begin once that upstream version line exists in npm.
      console.error(`No published revision for ${name} ${upstream.name}; skipping registry-based matrix entry`);
      continue;
    }
    const source = await readFile(testFile, 'utf8');
    const testRuntime = source.match(/^\/\/ @test-runtime:\s*(.+)$/m)?.[1].trim() ?? 'node';
    packages.push({ packageName: name, packageVersion: candidates.at(-1).version, testFile, testRuntime });
  }
}
if (!packages.length) throw new Error('No ports with test.js found');
const linuxWindows = packages.flatMap((test) => ['ubuntu-24.04', 'windows-2025'].map((os) => ({ ...test, os })));
process.stdout.write(JSON.stringify({ openharmony: packages, linuxWindows }));

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const registry = 'https://registry.npmjs.org';
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const packages = [];
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
    if (!candidates.length) throw new Error(`No published numeric revision found for ${name} ${upstream.name}`);
    packages.push({ packageName: name, packageVersion: candidates.at(-1).version, testFile });
  }
}
if (!packages.length) throw new Error('No ports with test.js found');
process.stdout.write(JSON.stringify({ include: packages }));

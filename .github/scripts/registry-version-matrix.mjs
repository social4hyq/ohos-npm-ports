const registry = 'https://registry.npmjs.org';
const scope = '@ohos-npm-ports/';

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const access = await getJson(`${registry}/-/org/ohos-npm-ports/package?format=cli`);
const packages = Object.keys(access).filter((name) => name.startsWith(scope)).sort();
const matrix = [];
for (const name of packages) {
  const packument = await getJson(`${registry}/${encodeURIComponent(name)}`);
  for (const version of Object.keys(packument.versions ?? {}).sort((a, b) =>
    (packument.time?.[a] ?? '').localeCompare(packument.time?.[b] ?? '') || a.localeCompare(b))) {
    const metadata = packument.versions[version];
    matrix.push({
      name,
      version,
      platformOnly: Boolean(metadata.os?.length || metadata.cpu?.length),
      os: metadata.os ?? [],
      cpu: metadata.cpu ?? [],
    });
  }
}
if (!matrix.length) throw new Error('Registry returned no @ohos-npm-ports package versions');
process.stdout.write(JSON.stringify({ include: matrix }));

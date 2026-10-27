import { normalizePackage } from "./normalize.mjs";

export async function fetchPackage(source, { full = false, fetcher = fetch } = {}) {
  const response = await fetcher(`https://registry.npmjs.org/${encodeURIComponent(source.name)}`, {
    headers: { Accept: full ? "application/json" : "application/vnd.npm.install-v1+json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Registry HTTP ${response.status}`);
  const metadata = await response.json();
  if (metadata.name !== source.name) throw new Error("Registry name mismatch");
  return { ...normalizePackage(metadata, source), checkedAt: new Date().toISOString() };
}

export async function refreshCatalog(packages, update, options = {}) {
  let next = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, packages.length) }, async () => {
      while (next < packages.length) {
        const index = next++;
        try {
          update(index, await fetchPackage(packages[index], options));
        } catch {
          failed++;
        }
      }
    }),
  );
  return { failed };
}

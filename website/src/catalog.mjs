export function normalizePackage(metadata, source = {}) {
  const version = metadata["dist-tags"]?.latest ?? null;
  const current = metadata.versions?.[version] ?? {};
  const deprecated = current.deprecated || null;
  return {
    name: metadata.name,
    shortName: metadata.name.replace("@ohos-npm-ports/", ""),
    upstream: source.upstream ?? null,
    directories: source.directories ?? [],
    description: current.description || metadata.description || "暂无包描述。",
    version,
    deprecated,
    status: deprecated ? "deprecated" : version ? "active" : "untagged",
    license: typeof current.license === "string" ? current.license : null,
    publishedAt: metadata.time?.[version] ?? null,
    versions: Object.keys(metadata.versions ?? {})
      .map((v) => ({
        version: v,
        tags: Object.keys(metadata["dist-tags"] ?? {}).filter(
          (t) => metadata["dist-tags"][t] === v,
        ),
        deprecated: metadata.versions[v].deprecated || null,
      }))
      .reverse(),
  };
}
export function filterPackages(
  packages,
  { query = "", status = "all", sort = "name" } = {},
) {
  const q = query.trim().toLowerCase();
  return packages
    .filter(
      (p) =>
        (status === "all" || p.status === status) &&
        [p.name, p.upstream, p.description].some((s) =>
          s?.toLowerCase().includes(q),
        ),
    )
    .sort((a, b) =>
      sort === "updated"
        ? (b.publishedAt || "").localeCompare(a.publishedAt || "") ||
          a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
}
export function installText(pkg, mode = "npm", version = pkg.version) {
  if (!version) return null;
  const spec = `${pkg.name}@${version}`;
  if (mode === "npm")
    return `npm install ${pkg.upstream ? `${pkg.upstream}@npm:` : ""}${spec}`;
  if (!pkg.upstream) return null;
  return JSON.stringify({ [mode]: { [pkg.upstream]: `npm:${spec}` } }, null, 2);
}

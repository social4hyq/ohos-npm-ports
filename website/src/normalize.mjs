export function normalizePackage(metadata, source = {}) {
  const version = metadata["dist-tags"]?.latest ?? null;
  const current = metadata.versions?.[version] ?? {};
  const deprecated = current.deprecated || null;
  return {
    name: metadata.name,
    shortName: metadata.name.replace("@ohos-npm-ports/", ""),
    upstream: source.upstream ?? null,
    directories: source.directories ?? [],
    description:
      current.description || metadata.description || source.description || "暂无包描述。",
    version,
    deprecated,
    status: deprecated ? "deprecated" : version ? "active" : "untagged",
    license: typeof current.license === "string" ? current.license : (source.license ?? null),
    publishedAt:
      metadata.time?.[version] ??
      (version === source.version ? (source.publishedAt ?? null) : null),
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

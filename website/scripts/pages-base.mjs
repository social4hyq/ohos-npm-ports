export function pagesBase(repository = "", override = "") {
  if (override) {
    if (
      !/^\/(?:[a-zA-Z0-9_.-]+\/)*$/.test(override) ||
      override.split("/").some((part) => part === "." || part === "..")
    )
      throw new Error("PAGES_BASE_PATH must be an absolute path with a trailing slash");
    return override;
  }
  if (!repository) return "/";
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some((part) => !/^[a-zA-Z0-9_.-]+$/.test(part)))
    throw new Error("GITHUB_REPOSITORY must be owner/repository");
  const [owner, name] = parts;
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? "/" : `/${name}/`;
}

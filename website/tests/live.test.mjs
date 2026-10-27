import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { fetchPackage, refreshCatalog } from "../src/registry.mjs";
const pkg = {
  name: "@ohos-npm-ports/example",
  upstream: "example",
  directories: ["ports/example/1"],
  version: "1",
  versions: [],
};
test("live query bypasses cache and uses compact metadata for the catalog", async () => {
  const result = await fetchPackage(pkg, {
    fetcher: async (url, options) => {
      assert.equal(new URL(url).hostname, "registry.npmjs.org");
      assert.equal(options.cache, "no-store");
      assert.equal(options.headers.Accept, "application/vnd.npm.install-v1+json");
      return {
        ok: true,
        json: async () => ({
          name: pkg.name,
          "dist-tags": { latest: "2" },
          versions: { 2: { deprecated: "Use upstream" } },
        }),
      };
    },
  });
  assert.equal(result.version, "2");
  assert.equal(result.status, "deprecated");
  assert.equal(result.upstream, "example");
});
test("failed queries preserve snapshot and bound request concurrency", async () => {
  let active = 0,
    maximum = 0;
  const results = [];
  const report = await refreshCatalog(
    Array.from({ length: 9 }, () => pkg),
    (index, value) => results.push([index, value]),
    {
      fetcher: async () => {
        active++;
        maximum = Math.max(active, maximum);
        await new Promise((r) => setTimeout(r, 2));
        active--;
        throw Error("offline");
      },
    },
  );
  assert.equal(maximum, 4);
  assert.equal(report.failed, 9);
  assert.equal(results.length, 0);
});
test("mismatched metadata and missing packages do not erase a snapshot", async () => {
  await assert.rejects(
    fetchPackage(pkg, {
      fetcher: async () => ({ ok: true, json: async () => ({ name: "other" }) }),
    }),
  );
  await assert.rejects(fetchPackage(pkg, { fetcher: async () => ({ ok: false, status: 404 }) }));
});
test("detail requests ask for full metadata", async () => {
  await fetchPackage(pkg, {
    full: true,
    fetcher: async (_, options) => {
      assert.equal(options.headers.Accept, "application/json");
      return { ok: true, json: async () => ({ name: pkg.name }) };
    },
  });
});

test("compact responses preserve repository descriptions and do not retain stale deprecation", async () => {
  const source = {
    ...pkg,
    description: "Useful tool",
    license: "MIT",
    deprecated: "Old warning",
    status: "deprecated",
  };
  const current = await fetchPackage(source, {
    fetcher: async () => ({
      ok: true,
      json: async () => ({ name: pkg.name, "dist-tags": { latest: "2" }, versions: { 2: {} } }),
    }),
  });
  assert.equal(current.description, "Useful tool");
  assert.equal(current.license, "MIT");
  assert.equal(current.deprecated, null);
  assert.equal(current.status, "active");
});

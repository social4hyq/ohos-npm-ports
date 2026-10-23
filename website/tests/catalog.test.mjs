import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { normalizePackage, filterPackages, installText } from "../src/catalog.mjs";
const manifest = {
  name: "@ohos-npm-ports/example",
  description: "<img src=x onerror=alert(1)>",
  "dist-tags": { latest: "2.0.0-1", "legacy-1": "1.0.0-2" },
  time: { "2.0.0-1": "2026-01-01T00:00:00Z" },
  versions: {
    "2.0.0-1": { license: "MIT" },
    "1.0.0-2": { deprecated: "Use upstream" },
  },
};
test("latest is selected by tag, not by prerelease suffix or publish order", () => {
  const p = normalizePackage(manifest, {
    upstream: "@original/example",
    directories: ["ports/example/2.0.0"],
  });
  assert.equal(p.version, "2.0.0-1");
  assert.equal(p.status, "active");
  assert.equal(p.description, manifest.description);
  assert.equal(p.versions.length, 2);
  assert.equal(p.versions.find((v) => v.version === "1.0.0-2").deprecated, "Use upstream");
});
test("missing latest is not guessed and deprecation is version-specific", () => {
  assert.equal(normalizePackage({ ...manifest, "dist-tags": {} }).version, null);
  const p = normalizePackage({
    ...manifest,
    "dist-tags": { latest: "1.0.0-2" },
  });
  assert.equal(p.status, "deprecated");
});
test("search includes upstream names and filters combine with query", () => {
  const p = normalizePackage(manifest, { upstream: "@original/example" });
  assert.equal(filterPackages([p], { query: " ORIGINAL ", status: "active" }).length, 1);
  assert.equal(filterPackages([p], { query: "original", status: "deprecated" }).length, 0);
  assert.equal(filterPackages([p], { query: "missing" }).length, 0);
});
test("alias preserves upstream import slot; unknown upstream uses explicit scoped install", () => {
  const p = normalizePackage(manifest, { upstream: "@original/example" });
  assert.equal(installText(p), "npm install @original/example@npm:@ohos-npm-ports/example@2.0.0-1");
  assert.deepEqual(JSON.parse(installText(p, "overrides")), {
    overrides: { "@original/example": "npm:@ohos-npm-ports/example@2.0.0-1" },
  });
  assert.equal(
    installText(normalizePackage(manifest)),
    "npm install @ohos-npm-ports/example@2.0.0-1",
  );
});
test("no install command is offered when no latest exists", () => {
  assert.equal(installText(normalizePackage({ ...manifest, "dist-tags": {} })), null);
});

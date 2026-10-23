import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, discoverSources } from "../scripts/build.mjs";
test("source discovery keeps scoped upstream names and platform packages separate", async () => {
  const root = await mkdtemp(join(tmpdir(), "catalog-sources-"));
  try {
    await mkdir(join(root, "original-tool/1.0.0/patchs"), { recursive: true });
    await writeFile(
      join(root, "original-tool/1.0.0/patchs/0001.patch"),
      '-  "name": "@original/tool",\n+  "name": "@ohos-npm-ports/original-tool",\n+ "@ohos-npm-ports/original-tool-openharmony-arm64": "1.0.0-1"',
    );
    await mkdir(join(root, "aaa-consumer/1.0.0"), { recursive: true });
    await writeFile(
      join(root, "aaa-consumer/1.0.0/build.sh"),
      "npm install @ohos-npm-ports/original-tool",
    );
    const sources = await discoverSources(root);
    assert.equal(
      sources.get("@ohos-npm-ports/original-tool").upstream,
      "@original/tool",
    );
    assert.equal(
      sources.get("@ohos-npm-ports/original-tool-openharmony-arm64").upstream,
      null,
    );
    assert.deepEqual(sources.get("@ohos-npm-ports/original-tool").directories, [
      "ports/original-tool/1.0.0",
      "ports/aaa-consumer/1.0.0",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("offline build emits relative-path static assets and only confirmed published data", async () => {
  const output = await mkdtemp(join(tmpdir(), "catalog-build-"));
  try {
    await build({
      output,
      fetchMetadata: async (name) =>
        name.endsWith("/bufferutil")
          ? {
              name,
              "dist-tags": { latest: "4.0.9-7" },
              versions: { "4.0.9-7": {} },
            }
          : null,
    });
    const data = JSON.parse(await readFile(join(output, "data.json"), "utf8"));
    assert.equal(data.packages.length, 1);
    assert.equal(data.packages[0].name, "@ohos-npm-ports/bufferutil");
    const html = await readFile(join(output, "index.html"), "utf8");
    assert.match(html, /\.\/app.mjs/);
    assert.match(html, /lang="zh-CN"/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
test("registry failures stop deployment rather than silently dropping packages", async () => {
  await assert.rejects(
    build({
      fetchMetadata: async () => {
        throw new Error("registry unavailable");
      },
    }),
    /registry unavailable/,
  );
});

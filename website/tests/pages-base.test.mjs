import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { pagesBase } from "../scripts/pages-base.mjs";

test("project Pages uses the repository subpath", () => {
  assert.equal(pagesBase("social4hyq/ohos-npm-ports"), "/ohos-npm-ports/");
});
test("user and organization Pages use the domain root", () => {
  assert.equal(pagesBase("ohos-npm-ports/ohos-npm-ports.github.io"), "/");
  assert.equal(pagesBase("Social4hyq/social4hyq.github.io"), "/");
  assert.equal(pagesBase("someone/other.github.io"), "/other.github.io/");
});
test("local development defaults to root and explicit paths support custom domains", () => {
  assert.equal(pagesBase(), "/");
  assert.equal(pagesBase("social4hyq/ohos-npm-ports", "/"), "/");
  assert.equal(pagesBase("social4hyq/ohos-npm-ports", "/preview/"), "/preview/");
  assert.equal(pagesBase("social4hyq/ohos-npm-ports", ""), "/ohos-npm-ports/");
});
test("malformed paths fail instead of generating broken links", () => {
  assert.throws(() => pagesBase("owner/repo", "preview"));
  assert.throws(() => pagesBase("owner/repo", "/preview"));
  assert.throws(() => pagesBase("invalid"));
});

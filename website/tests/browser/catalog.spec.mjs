import { test, expect } from "@playwright/test";
const fixtures = Array.from({ length: 14 }, (_, index) => ({
  name: `@ohos-npm-ports/tool-${String(index).padStart(2, "0")}`,
  shortName: `tool-${String(index).padStart(2, "0")}`,
  upstream: index === 0 ? "@original/tool" : `tool-${index}`,
  description:
    index === 0
      ? '<img src=x onerror="alert(1)"> safe package description'
      : "A useful native tool",
  version: index === 13 ? null : "2.0.0-1",
  status: index === 13 ? "untagged" : index === 12 ? "deprecated" : "active",
  deprecated: index === 12 ? "Use upstream instead" : null,
  license: "MIT",
  publishedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
  directories: ["ports/tool/2.0.0"],
  versions: [
    {
      version: "2.0.0-1",
      tags: index === 13 ? [] : ["latest"],
      deprecated: index === 12 ? "Use upstream instead" : null,
    },
    { version: "1.0.0-1", tags: ["legacy-1"], deprecated: "Use version 2" },
  ],
}));
async function fixture(page) {
  await page.route("**/data.json", (route) =>
    route.fulfill({
      json: { generatedAt: "2026-01-01T00:00:00Z", packages: fixtures },
    }),
  );
  await page.goto("./");
  await expect(page.locator(".package-row")).toHaveCount(10);
}
test("real generated data loads at the GitHub Pages subpath without console errors", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator(".package-row").first()).toBeVisible();
  await expect(page.locator("#total-count")).not.toHaveText("—");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("catalog.png"),
    fullPage: true,
  });
  await page.getByLabel("切换深浅主题").click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: testInfo.outputPath("catalog-dark.png"),
    fullPage: true,
  });
});
test("search, clear, status, sorting and pagination work together", async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel("下一页", { exact: true }).click();
  await expect(page.locator("#page-info")).toContainText("第 2 / 2 页");
  await page.getByLabel("搜索包", { exact: true }).fill(" ORIGINAL ");
  await expect(page.locator(".package-row")).toHaveCount(1);
  await page.getByLabel("搜索包", { exact: true }).fill("no-such-package");
  await expect(page.getByText("没有找到匹配的包")).toBeVisible();
  await page.getByRole("button", { name: "清除搜索与筛选" }).click();
  await page.getByRole("button", { name: "已废弃", exact: false }).click();
  await expect(page.locator(".package-row")).toHaveCount(1);
  await expect(page.locator(".package-name")).toHaveText("tool-12");
  await page.getByRole("button", { name: "全部包", exact: false }).click();
  await page.locator("#sort").selectOption("updated");
  await expect(page.locator(".package-name").first()).toHaveText("tool-13");
  await expect(page.getByLabel("复制 tool-13 安装命令")).toBeDisabled();
});
test("details, version selection and copy produce valid aliases and JSON", async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel("查看 tool-00 包详情").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#install-code")).toHaveText(
    "npm install @original/tool@npm:@ohos-npm-ports/tool-00@2.0.0-1",
  );
  await page.getByRole("button", { name: "overrides", exact: true }).click();
  expect(JSON.parse(await page.locator("#install-code").textContent())).toEqual(
    { overrides: { "@original/tool": "npm:@ohos-npm-ports/tool-00@2.0.0-1" } },
  );
  await page.locator("#version").selectOption("1.0.0-1");
  await expect(page.locator("#detail-warning")).toContainText("Use version 2");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.copied = value;
        },
      },
    }),
  );
  await page.getByRole("button", { name: "复制配置", exact: true }).click();
  expect(
    JSON.parse(await page.evaluate(() => window.copied)).overrides[
      "@original/tool"
    ],
  ).toMatch(/@1\.0\.0-1$/);
  await page.getByLabel("关闭包详情").click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByLabel("查看 tool-00 包详情")).toBeFocused();
});
test("untrusted npm descriptions are text, URL state restores and clipboard failure is visible", async ({
  page,
}) => {
  await page.route("**/data.json", (route) =>
    route.fulfill({
      json: { generatedAt: "2026-01-01T00:00:00Z", packages: fixtures },
    }),
  );
  await page.goto("./?q=original&status=active");
  await expect(page.locator(".package-row")).toHaveCount(1);
  await expect(page.locator(".package-description")).toContainText("<img");
  await expect(page.locator(".package-description img")).toHaveCount(0);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page.getByLabel("复制 tool-00 安装命令").click();
  await expect(page.locator("#toast")).toContainText("请在包详情");
});
test("data load failure offers a working retry", async ({ page }) => {
  let failed = true;
  await page.route("**/data.json", (route) =>
    failed
      ? route.fulfill({ status: 503, body: "unavailable" })
      : route.fulfill({
          json: { generatedAt: "2026-01-01T00:00:00Z", packages: fixtures },
        }),
  );
  await page.goto("./");
  await expect(page.getByText("暂时无法加载包目录")).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.locator(".package-row")).toHaveCount(10);
  await expect(page.locator("#error")).not.toBeVisible();
});

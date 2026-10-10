// @test-package: playwright-core
// @test-browser: chromium
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const { chromium } = (await import('playwright-core'));
  assert.ok(process.env.PORT_TEST_BROWSER_ENDPOINT, 'Missing browser service');
  const browser = await chromium.connectOverCDP(process.env.PORT_TEST_BROWSER_ENDPOINT);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('data:text/html,<title>Consumer</title><button onclick="this.textContent=\'clicked\'">ready</button>');
    assert.equal(await page.title(), 'Consumer');
    await page.getByRole('button').click();
    assert.equal(await page.getByRole('button').textContent(), 'clicked');
    const png = await page.screenshot();
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  } finally { await context.close(); await browser.close(); }
  tools.report({ browser: true, navigation: true, click: true, screenshot: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

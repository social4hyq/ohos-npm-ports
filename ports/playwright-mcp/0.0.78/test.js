// @test-package: @playwright/mcp
// @test-browser: chromium
// @test-prerequisite: ports/playwright-core/1.62.1
// @test-fixture: test-fixture
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  assert.ok(process.env.PORT_TEST_BROWSER_ENDPOINT, 'Missing browser service');
  const transport = new StdioClientTransport({ command: process.execPath, args: [tools.bin('@playwright/mcp', 'playwright-mcp'), '--cdp-endpoint', process.env.PORT_TEST_BROWSER_ENDPOINT, '--headless', '--caps', 'vision'], env: { ...process.env } });
  const client = new Client({ name: 'port-consumer', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === 'browser_navigate'));
    const result = await client.callTool({ name: 'browser_navigate', arguments: { url: 'data:text/html,<title>MCP Consumer</title><button>ready</button>' } });
    assert.ok(!result.isError, JSON.stringify(result));
    assert.match(JSON.stringify(result), /MCP Consumer|ready/);
    const evaluation = await client.callTool({ name: 'browser_evaluate', arguments: { function: "() => { document.querySelector('button').click(); return document.title; }" } });
    assert.ok(!evaluation.isError, JSON.stringify(evaluation));
    assert.match(JSON.stringify(evaluation), /MCP Consumer/);
    const screenshot = await client.callTool({ name: 'browser_take_screenshot', arguments: { type: 'png' } });
    assert.ok(!screenshot.isError, JSON.stringify(screenshot));
  } finally { await client.close(); await transport.close(); }
  tools.report({ protocol: true, navigation: true, evaluate: true, screenshot: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

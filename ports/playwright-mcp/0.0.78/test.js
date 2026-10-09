// @test-package: @playwright/mcp
// @test-dependency: playwright-core@npm:@ohos-npm-ports/playwright-core@1.62.1-2
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{join}=require('node:path'); const api=require('@playwright/mcp');
assert.equal(typeof api.createConnection,'function'); const bin=join('node_modules','.bin',process.platform==='win32'?'playwright-mcp.cmd':'playwright-mcp');
const r=spawnSync(bin,['--version'],{encoding:'utf8',shell:process.platform==='win32'}); assert.equal(r.status,0,r.stderr||r.stdout); assert.match(r.stdout,/0\.0\.78/);

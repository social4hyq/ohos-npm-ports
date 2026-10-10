// @test-package: bun-pty
// @test-prerequisite: ports/bun/1.4.2
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const output = tools.bunScript(String.raw`
    import assert from 'node:assert/strict';
    import { spawn } from 'bun-pty';
    const windows = process.platform === 'win32';
    const terminal = spawn(windows ? 'cmd.exe' : '/bin/sh', [], { name: 'xterm', cols: 80, rows: 24 });
    let text = '';
    const exited = new Promise((ok) => terminal.onExit(ok));
    terminal.onData((chunk) => { text += chunk; });
    terminal.resize(100, 30);
    assert.equal(terminal.cols, 100);
    assert.equal(terminal.rows, 30);
    const script = windows ? 'echo pty-^consumer-ready' : "printf 'pty-%s\\n' 'consumer-ready'";
    terminal.write(script + (windows ? '\r\n' : '\n'));
    terminal.write('exit' + (windows ? '\r\n' : '\n'));
    const status = await Promise.race([exited, new Promise((_, fail) => setTimeout(() => fail(new Error('PTY timeout')), 10000))]);
    assert.equal(status.exitCode, 0);
    assert.match(text, /pty-consumer-ready/);
    console.log('pty-function-ready');
    process.exit(0);
  `);
  assert.match(output.stdout, /pty-function-ready/);
  tools.report({ inputOutput: true, resize: true, exited: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

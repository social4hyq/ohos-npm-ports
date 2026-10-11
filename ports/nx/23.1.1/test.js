// @test-package: nx
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  tools.write('nx.json', JSON.stringify({ defaultBase: 'main' }));
  tools.write('app/project.json', JSON.stringify({ name: 'app', targets: { build: { executor: 'nx:run-commands', options: { command: 'node app/build.cjs' } } } }));
  tools.write('app/build.cjs', "require('node:fs').writeFileSync('artifact.txt', 'native-task-ready')");
  const env = { ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false', NX_SKIP_NX_CACHE: 'true' };
  tools.cli('nx', ['run', 'app:build'], { env });
  assert.equal(fs.readFileSync('artifact.txt', 'utf8'), 'native-task-ready');
  tools.cli('nx', ['graph', '--file=graph.json'], { env });
  assert.ok(fs.statSync('graph.json').size > 0);
  tools.report({ task: true, graph: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

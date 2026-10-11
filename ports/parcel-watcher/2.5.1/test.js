// @test-package: @parcel/watcher
// @test-project: react-assets
// @test-prerequisite: ports/parcel-watcher-openharmony-arm64/2.5.1
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const watcher = (await import('@parcel/watcher')).default;

(async () => {
  const local = createRequire(require.resolve('@parcel/watcher'));
  if (process.platform === 'openharmony') {
    const slot = local('@parcel/watcher-openharmony-arm64/package.json');
    assert.deepEqual(slot.os, ['openharmony']);
    assert.deepEqual(slot.cpu, ['arm64']);
  } else {
    assert.throws(() => local.resolve('@parcel/watcher-openharmony-arm64'), { code: 'MODULE_NOT_FOUND' });
  }
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'parcel-port-consumer-')));
  try {
    const snapshot = path.join(dir, 'snapshot');
    await watcher.writeSnapshot(dir, snapshot);
    fs.writeFileSync(path.join(dir, 'created.txt'), 'frontend source change');
    let events = [];
    const deadline = Date.now() + 10000;
    // FSEvents can batch the change after writeFileSync has returned.
    do {
      events = await watcher.getEventsSince(dir, snapshot);
      if (events.some((event) => event.path.endsWith('created.txt'))) break;
      await new Promise((done) => setTimeout(done, 100));
    } while (Date.now() < deadline);
    assert.ok(events.some((event) => event.path.endsWith('created.txt')), JSON.stringify(events));
    const report = { result: { snapshot: true, changes: true }, assets: [] };
    if (process.env.PORT_TEST_PRIMARY === 'true') await (await import(process.env.PORT_TEST_FRONTEND_HELPER)).verifyFrontend(report);
    fs.writeFileSync(process.env.PORT_TEST_REPORT, JSON.stringify(report));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

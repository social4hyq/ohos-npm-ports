// @test-package: sqlite3
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  const sqlite = (await import('sqlite3')).default;
  const db = new sqlite.Database(':memory:');
  const run = (sql, params = []) => new Promise((ok, fail) => db.run(sql, params, (error) => error ? fail(error) : ok()));
  const all = (sql) => new Promise((ok, fail) => db.all(sql, (error, rows) => error ? fail(error) : ok(rows)));
  try {
    await run('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)');
    await run('BEGIN');
    await run('INSERT INTO items(value) VALUES (?)', ['consumer']);
    await run('COMMIT');
    await run('BEGIN');
    await run("INSERT INTO items(value) VALUES ('rollback')");
    await run('ROLLBACK');
    assert.deepEqual(await all('SELECT value FROM items'), [{ value: 'consumer' }]);
    await run("UPDATE items SET value='updated'");
    assert.deepEqual(await all('SELECT value FROM items'), [{ value: 'updated' }]);
    await run('DELETE FROM items');
    assert.equal((await all('SELECT * FROM items')).length, 0);
  } finally { await new Promise((ok, fail) => db.close((error) => error ? fail(error) : ok())); }
  tools.report({ transactions: true, crud: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

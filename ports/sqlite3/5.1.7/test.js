const assert = require('node:assert/strict');
const sqlite3 = require('@ohos-npm-ports/sqlite3');

assert.equal(typeof sqlite3.Database, 'function');
const db = new sqlite3.Database(':memory:');
db.serialize(() => {
  db.run('CREATE TABLE probe (value TEXT NOT NULL)');
  db.run('INSERT INTO probe(value) VALUES (?)', ['multi-os']);
  db.get('SELECT value FROM probe', (error, row) => {
    try {
      assert.ifError(error);
      assert.equal(row.value, 'multi-os');
      db.close((closeError) => {
        assert.ifError(closeError);
        console.log('sqlite3 CRUD probe passed');
      });
    } catch (failure) {
      db.close(() => { throw failure; });
    }
  });
});

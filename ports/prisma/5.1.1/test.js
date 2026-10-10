// @test-package: prisma
// @test-timeout: 1800
// @test-prerequisite: ports/prisma-engines/5.1.1
// @test-fixture: test-fixture
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  tools.write('schema.prisma', `generator client {
  provider = "prisma-client-js"
  output = "./generated-client"
}
datasource db {
  provider = "sqlite"
  url = "file:./consumer.db"
}
model Item {
  id Int @id @default(autoincrement())
  value String
}`);
  tools.cli('prisma', ['db', 'push', '--schema', 'schema.prisma', '--skip-generate'], { timeout: 300000 });
  tools.cli('prisma', ['generate', '--schema', 'schema.prisma'], { timeout: 300000 });
  const { PrismaClient } = require(require('node:path').resolve('generated-client'));
  const client = new PrismaClient();
  try {
    const row = await client.item.create({ data: { value: 'consumer' } });
    assert.equal((await client.item.findUnique({ where: { id: row.id } })).value, 'consumer');
    await client.$transaction([client.item.update({ where: { id: row.id }, data: { value: 'updated' } })]);
    assert.equal((await client.item.findUnique({ where: { id: row.id } })).value, 'updated');
    await client.item.delete({ where: { id: row.id } });
    assert.equal(await client.item.count(), 0);
  } finally { await client.$disconnect(); }
  tools.report({ generated: true, engine: true, transaction: true, crud: true });
})().catch((error) => { console.error(error); process.exitCode = 1; });

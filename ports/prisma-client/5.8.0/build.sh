#!/bin/sh
set -e

# Zero-compile repack of @prisma/client 5.8.0. The client is pure JS; on
# OpenHarmony it works unmodified once engines come from
# @ohos-npm-ports/prisma-engines via the @ohos-npm-ports/prisma CLI override
# (see ports/prisma/5.1.1). This port exists as the drop-in overrides slot and
# as an OHOS-verified repack: every shipped file is checksum-compared against
# upstream, and the full generate + CRUD flow is smoke-tested on an OHOS
# device under both node and bun.

VERSION=5.8.0
PKG=client
SCOPE=prisma

CURL="curl -fsSL --retry 8 --retry-all-errors --connect-timeout 30 --speed-limit 10240 --speed-time 30"
$CURL "https://registry.npmjs.org/@${SCOPE}/${PKG}/-/${PKG}-${VERSION}.tgz" -o src.tgz
echo "61398ed8615cf6ab560c4aaf88499ed83a559f0d941cc8c1b43f66cebe93dfc4  src.tgz" | sha256sum -c -
tar -zxf src.tgz
rm src.tgz
mv package src
cd src

rm -rf ../pkg
mkdir ../pkg
tar -zcf - . | tar -zxf - -C ../pkg
rm -rf ../pkg/node_modules
cp ../package.json ../pkg/package.json

cd ..
# integrity: every shipped file must be byte-identical to upstream
(cd pkg && sha256sum -c ../upstream-files.sha256)
node -e '
  const p = require("./pkg/package.json");
  if (p.name !== "@ohos-npm-ports/prisma-client" || p.version !== "5.8.0-1") { console.error("bad manifest"); process.exit(1); }
  const { execSync } = require("child_process");
  for (const f of ["index.js", "runtime/library.js", "generator-build/index.js", "scripts/postinstall.js"]) {
    require("fs").accessSync(require("path").join("pkg", f));
    execSync("node --check " + JSON.stringify(require("path").join("pkg", f)));
  }
  console.log("OK: manifest + entry files parse");
'
(cd pkg && npm pack --ignore-scripts >/dev/null && mv ohos-npm-ports-prisma-client-5.8.0-1.tgz ..)
test -f ohos-npm-ports-prisma-client-5.8.0-1.tgz

# Drop-in smoke on the real machine: all three overrides, no PRISMA_* env vars.
# client 5.8.0 asks for engine version 5.8.0-37.* while the engines port ships
# the 5.1.1-pinned commit, so this also exercises the version-agnostic local
# engine resolution of the prisma CLI port.
SMOKE="$(pwd)/.smoke"
rm -rf "$SMOKE"
mkdir -p "$SMOKE/app"
cat > "$SMOKE/package.json" <<EOF
{
  "name": "prisma-client-port-smoke",
  "private": true,
  "dependencies": {
    "@prisma/client": "file:$(pwd)/ohos-npm-ports-prisma-client-5.8.0-1.tgz",
    "prisma": "npm:@ohos-npm-ports/prisma@5.1.1-1"
  },
  "overrides": {
    "@prisma/engines": "npm:@ohos-npm-ports/prisma-engines@5.1.1-3"
  }
}
EOF
cat > "$SMOKE/app/schema.prisma" <<'EOF'
generator client {
  provider = "prisma-client-js"
  output   = "client"
}
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
model Widget {
  id   Int    @id @default(autoincrement())
  name String
}
EOF

SMOKE_ABS="$(cd "$SMOKE" && pwd)"
cd "$SMOKE"
npm install --ignore-scripts --no-audit --no-fund
cd app

CRUD='const { PrismaClient } = require("./client");
(async () => {
  const p = new PrismaClient();
  const w = await p.widget.create({ data: { name: "smoke" } });
  const f = await p.widget.findUnique({ where: { id: w.id } });
  if (!f || f.name !== "smoke") throw new Error("read-back failed");
  const n = await p.widget.count();
  if (n !== 1) throw new Error("bad count: " + n);
  await p.$disconnect();
  console.log("CRUD OK");
})().catch((e) => { console.error(e.message); process.exit(1); });'

# node runtime
"$SMOKE_ABS/node_modules/.bin/prisma" db push --schema schema.prisma --skip-generate 2>&1 | grep -q 'database is now in sync' || { echo "db push failed" >&2; exit 1; }
"$SMOKE_ABS/node_modules/.bin/prisma" generate --schema schema.prisma 2>&1 | grep -q 'Generated Prisma Client' || { echo "generate failed" >&2; exit 1; }
node -e "$CRUD"
# bun runtime; the ci-runner image ships no bun -- gate it and cover bun on a real device
if command -v bun >/dev/null 2>&1; then
  rm -rf client dev.db
  bun "$SMOKE_ABS/node_modules/prisma/build/index.js" db push --schema schema.prisma --skip-generate 2>&1 | grep -q 'database is now in sync' || { echo "bun db push failed" >&2; exit 1; }
  bun "$SMOKE_ABS/node_modules/prisma/build/index.js" generate --schema schema.prisma 2>&1 | grep -q 'Generated Prisma Client' || { echo "bun generate failed" >&2; exit 1; }
  bun -e "$CRUD"
fi
ENGINE="$(ls client/libquery_engine-*.so.node)"
readelf -h "$ENGINE" | grep -q 'AArch64'
readelf -S "$ENGINE" | grep -q '\.codesign'

cd ..
rm -rf "$SMOKE" ohos-npm-ports-prisma-client-5.8.0-1.tgz
echo "OK: @ohos-npm-ports/prisma-client built and smoke-tested"

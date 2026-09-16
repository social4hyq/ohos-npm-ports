#!/bin/sh
set -e

# Zero-compile repack of the prisma CLI with an OpenHarmony engine-resolution
# patch: on openharmony, Prisma engines (query engine library / schema engine
# CLI) resolve from the @prisma/engines package root (npm override to
# @ohos-npm-ports/prisma-engines) instead of being downloaded from
# binaries.prisma.sh, which has no OHOS builds and would serve platform-
# mismatched debian glibc binaries.

VERSION=5.1.1
PKG=prisma

CURL="curl -fsSL --retry 8 --retry-all-errors --connect-timeout 30 --speed-limit 10240 --speed-time 30"
$CURL "https://registry.npmjs.org/${PKG}/-/${PKG}-${VERSION}.tgz" -o src.tgz
echo "82290a4f68947526fbfea3a924d8ae91b9b7e6080b708d98db8bae188aa949b1  src.tgz" | sha256sum -c -
tar -zxf src.tgz
rm src.tgz
mv package src
cd src
patch -p1 < ../patchs/0001-openharmony-local-engines.patch
# toybox patch can silently no-op on a malformed header; assert it landed.
grep -q 'async function ohosLocalEngines' build/index.js
grep -q 'process.platform === "openharmony" ? (await ohosLocalEngines(downloadParams))' build/index.js
node --check build/index.js

# Cross-platform regression: the non-openharmony branch must be the untouched
# upstream download() call, so linux/darwin/win32 consumers keep stock behavior.
node -e '
  const fs = require("fs");
  const src = fs.readFileSync("build/index.js", "utf8");
  const n = src.split(": await download(downloadParams);").length - 1;
  if (n !== 2) { console.error("expected 2 gated download call sites, found " + n); process.exit(1); }
  const i = src.indexOf("async function ohosLocalEngines");
  const j = src.indexOf("async function getBinaryPathsByVersion");
  if (i < 0 || j < 0 || i > j) { console.error("helper not defined before its callers"); process.exit(1); }
  console.log("OK: non-openharmony branch routes to upstream download()");
'

rm -rf ../pkg
mkdir ../pkg
# everything upstream ships, minus install-time state, plus the port manifest
tar -zcf - . | tar -zxf - -C ../pkg
rm -rf ../pkg/node_modules
cp ../package.json ../pkg/package.json

cd ..
node -e '
  const p = require("./pkg/package.json");
  if (p.name !== "@ohos-npm-ports/prisma" || p.version !== "5.1.1-1") { console.error("bad manifest"); process.exit(1); }
  console.log("OK: manifest");
'
# file: dir installs symlink and breaks the consumer'"'"'s node_modules walk-up;
# install the packed tarball instead
(cd pkg && npm pack --ignore-scripts >/dev/null && mv ohos-npm-ports-prisma-5.1.1-1.tgz ..)
test -f ohos-npm-ports-prisma-5.1.1-1.tgz

# Drop-in smoke on the real machine: overrides only, no PRISMA_* env vars.
# npm install-scripts stay disabled so the flow is deterministic.
SMOKE="$(pwd)/.smoke"
rm -rf "$SMOKE"
mkdir -p "$SMOKE/app"
cat > "$SMOKE/package.json" <<EOF
{
  "name": "prisma-port-smoke",
  "private": true,
  "dependencies": {
    "prisma": "file:$(pwd)/ohos-npm-ports-prisma-5.1.1-1.tgz",
    "@prisma/client": "5.1.1"
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
# bun runtime (the generated client must dlopen the OHOS engine under bun too);
# the ci-runner image ships no bun -- gate it and cover bun on a real device
if command -v bun >/dev/null 2>&1; then
  rm -rf client dev.db
  bun "$SMOKE_ABS/node_modules/prisma/build/index.js" db push --schema schema.prisma --skip-generate 2>&1 | grep -q 'database is now in sync' || { echo "bun db push failed" >&2; exit 1; }
  bun "$SMOKE_ABS/node_modules/prisma/build/index.js" generate --schema schema.prisma 2>&1 | grep -q 'Generated Prisma Client' || { echo "bun generate failed" >&2; exit 1; }
  bun -e "$CRUD"
fi
# the engine that landed in the generated client must be the OHOS one (signed,
# AArch64, .codesign section), not a downloaded debian glibc binary
ENGINE="$(ls client/libquery_engine-*.so.node)"
readelf -h "$ENGINE" | grep -q 'AArch64'
readelf -S "$ENGINE" | grep -q '\.codesign'

cd ..
rm -rf "$SMOKE" ohos-npm-ports-prisma-5.1.1-1.tgz
echo "OK: @ohos-npm-ports/prisma built and smoke-tested"

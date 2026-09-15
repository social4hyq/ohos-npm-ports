#!/bin/sh
# 消费侧冒烟（覆盖 CI 默认的 npm-pack-install-require）：pack 出 tgz → 干净工程里
# 安装 → 用装好的 CLI 真跑一次 typecheck，证明 openharmony 上走的是包内二进制、
# 且 lib.d.ts 等运行期物料在包内齐全。cwd = 构建产物目录。
set -e

PKG_DIR="$(pwd)"
TGZ="$(npm pack --silent --ignore-scripts | tail -1)"
SCRATCH="$(mktemp -d)"
trap 'rm -f "${PKG_DIR}/${TGZ}"; rm -rf "${SCRATCH}"' EXIT

cd "${SCRATCH}"
npm init -y >/dev/null
npm install --no-audit --no-fund --ignore-scripts "${PKG_DIR}/${TGZ}" >/dev/null

BIN="${SCRATCH}/node_modules/.bin/tsgo"
[ -x "${BIN}" ] || { echo "error: tsgo bin was not installed" >&2; exit 1; }
printf '{"compilerOptions":{"strict":true}}' > tsconfig.json
printf 'const n: number = "x";\n' > bad.ts
"${BIN}" --version
"${BIN}" --noEmit -p tsconfig.json > out.txt 2>&1 || true
grep -q 'error TS2322' out.txt || { cat out.txt >&2; exit 1; }

echo "OK: smoke passed (installed tsgo reports the expected type error)"

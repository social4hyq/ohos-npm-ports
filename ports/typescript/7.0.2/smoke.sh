#!/bin/sh
# 消费侧冒烟（覆盖 CI 默认的 npm-pack-install-require）。cwd = 槽位包目录
# （smoke-port.sh / validate-port.sh 以 publish.sh 第一条 cd 的产物目录为 cwd）。
#
# 与内嵌形态（7.0.2-2）不同，二进制已拆到槽位包，验证三件事：
#   1. 槽位包产物：ELF AArch64 + noembed 声明文件齐全 + 容器内可直接执行
#      （容器 aarch64 linux 与 OHOS 同为 aarch64；7.0.2-2 同一二进制已在真机跑通）
#   2. 主包接线：optionalDependencies 指向槽位包、getExePath.js 已指向槽位包
#   3. OHOS 解析链路端到端：伪造 process.platform=openharmony，在装好
#      主包+槽位包的干净工程里调 getExePath()，应解析到槽位包内的 tsc 并可执行
#      （真机 exec 属 verification.md 盲区，不在 CI 做）
set -eu

SLOT_DIR="$(pwd)"
MAIN_DIR="$(dirname "$PWD")/typescript-7.0.2"
SLOT_PKG="@ohos-npm-ports/typescript-openharmony-arm64"

echo "-- 1. 槽位包产物自检 --"
readelf -h lib/tsc | grep -q AArch64
test -s lib/lib.d.ts

echo "-- 2. 主包接线 --"
node -e '
  const fs = require("fs");
  const main = JSON.parse(fs.readFileSync(process.argv[1] + "/package.json", "utf8"));
  const slot = JSON.parse(fs.readFileSync(process.argv[2] + "/package.json", "utf8"));
  if (main.name !== "@ohos-npm-ports/typescript") throw new Error("main name: " + main.name);
  if (main.version !== slot.version) throw new Error("version mismatch: " + main.version + " vs " + slot.version);
  if (main.optionalDependencies[slot.name] !== slot.version) throw new Error("optionalDependencies wiring wrong");
' "${MAIN_DIR}" "${SLOT_DIR}"
grep -qF "${SLOT_PKG}" "${MAIN_DIR}/lib/getExePath.js"

echo "-- 3. 打包安装 + 真跑二进制 + OHOS 解析链路 --"
TGZ="$(npm pack --silent --ignore-scripts | tail -1)"
[ -f "${TGZ}" ] || { echo "error: npm pack produced nothing" >&2; exit 1; }
# 主包也必须 pack 成 tgz 再装：npm install <目录> 会在 node_modules 里建 symlink，
# ESM 按 realpath 解析依赖，会跑出 scratch 导致槽位包解析不到
MAIN_TGZ="$(cd "${MAIN_DIR}" && npm pack --silent --ignore-scripts | tail -1)"
MAIN_TGZ="${MAIN_DIR}/${MAIN_TGZ}"
SCRATCH="$(mktemp -d)"
trap 'rm -f "${SLOT_DIR}/${TGZ}" "${MAIN_TGZ}"; rm -rf "${SCRATCH}"' EXIT

cd "${SCRATCH}"
npm init -y >/dev/null
# --force：槽位包 os/cpu 限定 openharmony/arm64，容器（linux）上直装会被
# EBADPLATFORM 拦下，这里刻意强装以验证 OHOS 解析链路；一次性 scratch 无副作用
npm install --no-audit --no-fund --ignore-scripts --force \
    "${SLOT_DIR}/${TGZ}" "${MAIN_TGZ}" >/dev/null

echo "-- 3a. 消费者视角（linux 容器 = 上游平台包路径）--"
BIN="${SCRATCH}/node_modules/.bin/tsc"
[ -x "${BIN}" ] || { echo "error: tsc bin was not installed" >&2; exit 1; }
"${BIN}" --version

echo "-- 3b. OHOS 视角（伪造 process.platform，getExePath 应解析到槽位包）--"
EXE=$(node --input-type=module -e '
  import path from "node:path";
  import { pathToFileURL } from "node:url";
  Object.defineProperty(process, "platform", { value: "openharmony" });
  const mod = await import(pathToFileURL(path.join(process.argv[1], "lib", "getExePath.js")).href);
  console.log(mod.default());
' "${SCRATCH}/node_modules/@ohos-npm-ports/typescript")
case "${EXE}" in
  */node_modules/"${SLOT_PKG}"/lib/tsc) ;;
  *) echo "error: getExePath resolved to ${EXE}, expected the slot package" >&2; exit 1 ;;
esac
[ -x "${EXE}" ] || { echo "error: resolved exe is not executable" >&2; exit 1; }
"${EXE}" --version

echo "OK: smoke passed (${SLOT_PKG} wiring + OHOS resolution + binary runs)"

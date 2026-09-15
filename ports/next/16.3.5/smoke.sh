#!/bin/sh
# 本 port 的 per-port smoke，覆盖 ci.yml / validate-port.sh 里的默认通用 smoke
# （见 docs/zh-CN/contributor/verification.md「第二层」）。
#
# 为什么不能沿用默认那套：默认 smoke 把包 npm pack → 装进临时工程 → 真 require() 一次，
# 而本 port 平台包的 main 就是 OHOS 的 .node，容器（glibc/Ubuntu）里 dlopen 必然失败：
#   Error loading shared library libtime_service_ndk.so (...).node
# 这是 verification.md 写明的盲区「容器验证 ≠ 部署证明」，不是产物缺陷；容器内也没有
# OHOS NDK 库可补，真机 dlopen 复测按该节约定不在这里做。
#
# 所以容器内能判定的部分全部保留，并补上默认 smoke 覆盖不到的两处打包检查：
#   1. 产物 ELF：AArch64 + .codesign 段 + napi_register_module_v1 入口
#      —— strip/签名被绕过、错架构、空壳产物都在这一层被抓住
#   2. npm pack：tgz 里恰好只有 .node 与 package.json（name/files 声明没跑偏）
#   3. 双包接线：平台包 name/version ↔ 主包 optionalDependencies ↔ 主包 loader 补丁
#      三处一致（装机时 next 才找得到、也才加载得到这个 binding）
# cwd = 构建产物目录（平台包目录），由 smoke-port.sh / validate-port.sh 保证。
set -eu

NODE=next-swc.openharmony-arm64.node

# --- 1. 产物 ELF ---
readelf -h "$NODE" | grep -q AArch64
readelf -S "$NODE" | grep -q '\.codesign'
readelf -s "$NODE" | grep -q napi_register_module_v1

# --- 2. npm pack 内容 ---
TGZ=$(npm pack --silent --ignore-scripts | tail -1)
[ -f "$TGZ" ] || { echo "error: npm pack produced nothing" >&2; exit 1; }
TGZ="$PWD/$TGZ"
trap 'rm -f "$TGZ"' EXIT
LIST=$(tar -tzf "$TGZ" | sort)
EXPECT=$(printf 'package/package.json\npackage/%s\n' "$NODE" | sort)
[ "$LIST" = "$EXPECT" ] || {
  echo "error: unexpected tgz contents:" >&2
  echo "$LIST" >&2
  exit 1
}

# --- 3. 双包接线 ---
node -e '
  const main = require("../next-16.3.5/package.json");
  const sub = require("./package.json");
  if (sub.name !== "@ohos-npm-ports/next-swc-openharmony-arm64") throw new Error("platform pkg name: " + sub.name);
  if (main.name !== "@ohos-npm-ports/next") throw new Error("main pkg name: " + main.name);
  if (main.version !== sub.version) throw new Error("version mismatch: " + main.version + " vs " + sub.version);
  if (main.optionalDependencies[sub.name] !== sub.version) throw new Error("optionalDependencies wiring wrong");
'
grep -q openharmony-arm64 ../next-16.3.5/dist/build/swc/index.js
grep -qF "@ohos-npm-ports/next-swc-openharmony-arm64" ../next-16.3.5/dist/build/swc/index.js

echo "smoke ok (per-port next): ELF + packaging + two-package wiring"

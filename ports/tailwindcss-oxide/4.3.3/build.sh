#!/bin/sh
set -e

# 容器 rust host triple 即 aarch64-unknown-linux-ohos，napi build 直接产出正确命名的 binding。
# 双包结构镜像上游：主包（JS loader）+ openharmony-arm64 二进制子包；
# 主包 optionalDependencies 以真实版本号 pin 子包（npm stage publish 不重写 workspace:*）
VERSION=4.3.3
PKG=tailwindcss

curl -fsSL "https://github.com/tailwindlabs/tailwindcss/archive/refs/tags/v${VERSION}.tar.gz" -o tailwindcss.tar.gz
tar -zxf tailwindcss.tar.gz
rm tailwindcss.tar.gz
mv "${PKG}-${VERSION}" src
cd src

patch -p1 < ../patchs/0001-package-json.patch
patch -p1 < ../patchs/0002-add-openharmony-subpackage.patch

brew install -y rust

cd crates/node
npm install --ignore-scripts

# napi-rs 按交叉编译假设写死链接器路径，原生编译用 cargo 环境变量覆盖指向本机 cc
export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_OHOS_LINKER="$(command -v cc)"
npm run build:platform

NODE_FILE=npm/openharmony-arm64/tailwindcss-oxide.openharmony-arm64.node
test -f "$NODE_FILE"

llvm-strip --strip-all "$NODE_FILE"
binary-sign-tool sign -selfSign 1 -inFile "$NODE_FILE" -outFile "${NODE_FILE}.signed"
mv "${NODE_FILE}.signed" "$NODE_FILE"
chmod +x "$NODE_FILE"

# --- 校验：双包内容 / ELF / 版本一致性 / 真实扫描冒烟 ---

MAIN_NAME=$(node -e "console.log(require('./package.json').name)")
[ "$MAIN_NAME" = "@ohos-npm-ports/tailwindcss-oxide" ]

SUBPKG_NAME=$(node -e "console.log(require('./npm/openharmony-arm64/package.json').name)")
[ "$SUBPKG_NAME" = "@ohos-npm-ports/tailwindcss-oxide-openharmony-arm64" ]

readelf -h "$NODE_FILE" | grep -q 'AArch64'
readelf -S "$NODE_FILE" | grep -q '\.codesign'

# 主包对本仓子包的 pin 必须等于其实际 version（其余平台仍指上游原版）
node -e '
  const main = require("./package.json");
  const sub = require("./npm/openharmony-arm64/package.json");
  const declared = main.optionalDependencies["@ohos-npm-ports/tailwindcss-oxide-openharmony-arm64"];
  if (declared !== sub.version) {
    console.error(`optionalDependencies pin ${declared} != subpackage version ${sub.version}`);
    process.exit(1);
  }
'

node -e '
  const { Scanner } = require("./npm/openharmony-arm64/tailwindcss-oxide.openharmony-arm64.node");
  const scanner = new Scanner({ sources: [] });
  const candidates = scanner.scanFiles([
    { content: "<div class=\"text-red-500 flex\"></div>", extension: "html" },
  ]);
  console.log("scanFiles() candidates:", candidates);
  if (!candidates.includes("text-red-500") || !candidates.includes("flex")) {
    throw new Error("unexpected scan output: " + JSON.stringify(candidates));
  }
'

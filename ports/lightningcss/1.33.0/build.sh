#!/bin/sh
set -e

# 容器 rust 的 host triple 即 aarch64-unknown-linux-ohos，napi build 直接产出正确命名的 binding
VERSION=1.33.0
PKG=lightningcss

curl -fsSL "https://github.com/parcel-bundler/lightningcss/archive/refs/tags/v${VERSION}.tar.gz" -o lightningcss.tar.gz
tar -zxf lightningcss.tar.gz
rm lightningcss.tar.gz
# 解压目录恰为 ${PKG}-${VERSION}，无需改名

cd "${PKG}-${VERSION}"
patch -p1 < ../patchs/0001-update-package-json.patch
patch -p1 < ../patchs/0002-openharmony-loader.patch

brew install -y rust

# puppeteer devDep（仅文档工具用）的 postinstall 遇 openharmony 硬失败，与 napi 构建无关
npm install --ignore-scripts

# scripts/build.js 调裸 napi 命令，node_modules/.bin 不在 PATH
export PATH="$(pwd)/node_modules/.bin:$PATH"
node scripts/build.js --release

test -f lightningcss.linux-arm64-ohos.node

llvm-strip --strip-all lightningcss.linux-arm64-ohos.node
binary-sign-tool sign -selfSign 1 -inFile lightningcss.linux-arm64-ohos.node -outFile lightningcss.linux-arm64-ohos.node.signed
mv lightningcss.linux-arm64-ohos.node.signed lightningcss.linux-arm64-ohos.node
chmod +x lightningcss.linux-arm64-ohos.node

# --- 校验：包内容 / ELF / optionalDependencies / 真实 transform 冒烟 ---

NAME=$(node -e "console.log(require('./package.json').name)")
[ "$NAME" = "@ohos-npm-ports/lightningcss" ]

node --check node/index.js
grep -q "process.platform === 'openharmony'" node/index.js

readelf -h lightningcss.linux-arm64-ohos.node | grep -q 'AArch64'
readelf -S lightningcss.linux-arm64-ohos.node | grep -q '\.codesign'

# optionalDependencies 指上游平台子包，必须钉住基础版本（本包版本带 -N 后缀）
node -e '
  const pkg = require("./package.json");
  const base = pkg.version.replace(/-.*$/, "");
  for (const [name, range] of Object.entries(pkg.optionalDependencies ?? {})) {
    if (name.startsWith("lightningcss-") && range !== base) {
      console.error(`optionalDependencies["${name}"] = ${range}, expected ${base}`);
      process.exit(1);
    }
  }
'

node -e '
  const { transform } = require("./node/index.js");
  const { code } = transform({
    filename: "test.css",
    code: Buffer.from(".a { color: red }"),
    minify: true,
  });
  const out = code.toString();
  console.log("transform() output:", out);
  if (!out.includes(".a") || !out.includes("red")) {
    throw new Error("unexpected transform output");
  }
'

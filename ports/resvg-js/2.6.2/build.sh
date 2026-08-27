#!/bin/sh
set -e

# 容器 rust host triple 即 aarch64-unknown-linux-ohos。绕过 napi build：上游
# devDependencies pin 的 @napi-rs/cli@^2.18 不认 openharmony host，且 js-binding.js
# 上游已提交并由 0002 处理；直接 cargo 出 cdylib 即可（无需 npm install）
VERSION=2.6.2
PKG=resvg-js

curl -fsSL "https://github.com/thx/resvg-js/archive/refs/tags/v${VERSION}.tar.gz" -o resvg-js.tar.gz
tar -zxf resvg-js.tar.gz
rm resvg-js.tar.gz
# 解压目录恰为 ${PKG}-${VERSION}，无需改名

cd "${PKG}-${VERSION}"
patch -p1 < ../patchs/0001-update-package-json.patch
patch -p1 < ../patchs/0002-openharmony-loader.patch

# 移除 rust-toolchain 文件，避免 rustup 查找（容器用 brew rust）
rm -f rust-toolchain

brew install -y rust

cargo build --release

test -f target/release/libresvg_js.so
cp target/release/libresvg_js.so resvgjs.linux-arm64-ohos.node

llvm-strip --strip-all resvgjs.linux-arm64-ohos.node
binary-sign-tool sign -selfSign 1 -inFile resvgjs.linux-arm64-ohos.node -outFile resvgjs.linux-arm64-ohos.node.signed
mv resvgjs.linux-arm64-ohos.node.signed resvgjs.linux-arm64-ohos.node
chmod +x resvgjs.linux-arm64-ohos.node

# --- 校验：包内容 / ELF / optionalDependencies / 真实渲染冒烟 ---

NAME=$(node -e "console.log(require('./package.json').name)")
[ "$NAME" = "@ohos-npm-ports/resvg-resvg-js" ]

node --check js-binding.js
grep -q "case 'openharmony':" js-binding.js

readelf -h resvgjs.linux-arm64-ohos.node | grep -q 'AArch64'
readelf -S resvgjs.linux-arm64-ohos.node | grep -q '\.codesign'

# optionalDependencies 指上游平台子包，必须钉住基础版本
node -e '
  const pkg = require("./package.json");
  const base = pkg.version.replace(/-.*$/, "");
  for (const [name, range] of Object.entries(pkg.optionalDependencies ?? {})) {
    if (name.startsWith("@resvg/resvg-js-") && range !== base) {
      console.error(`optionalDependencies["${name}"] = ${range}, expected ${base}`);
      process.exit(1);
    }
  }
'

# 渲染冒烟：纯几何路径，不碰字体渲染（容器字体可用性未验证）
node -e '
  const { Resvg } = require("./js-binding.js");
  const svg = `<svg width="100" height="50" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="30" height="20" fill="red"/>
  </svg>`;

  const resvg = new Resvg(svg);
  const bbox = resvg.innerBBox();
  // BBox 字段是非枚举的原型 getter，需按名直读
  console.log("innerBBox():", bbox && { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height });
  if (!bbox || typeof bbox.width !== "number" || bbox.width <= 0 || bbox.height <= 0) {
    throw new Error("unexpected bbox result");
  }
  if (bbox.x !== 10 || bbox.y !== 10 || bbox.width !== 30 || bbox.height !== 20) {
    throw new Error(`bbox does not match input rect: ${JSON.stringify({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height })}`);
  }

  const rendered = resvg.render();
  const png = rendered.asPng();
  console.log("render() -> PNG bytes:", png.length, "size:", rendered.width, "x", rendered.height);
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < magic.length; i++) {
    if (png[i] !== magic[i]) {
      throw new Error("output is not a valid PNG");
    }
  }
'

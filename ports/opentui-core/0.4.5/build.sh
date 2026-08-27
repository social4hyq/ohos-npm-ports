#!/bin/sh
set -e

# 源码构建：libopentui.so 用 zig 0.15.2（对齐上游 build-core.yml 的 ZIG_VERSION）交叉编译
# aarch64-linux-musl——OHOS 同 libc 族，官方 @opentui/core-linux-arm64-musl 即同 target 构建，
# 链接形态一致（NEEDED libc.so）。JS bundle 为平台无关产物，沿用官方 npm 包重打包
# （同 bufferutil 模式）；loader 的 openharmony 分支由 0002 注入，指向包内 libopentui.so

VERSION=0.4.5
PKG=opentui-core
ZIG_VERSION=0.15.2
ZIG_SHA256=958ed7d1e00d0ea76590d27666efbf7a932281b3d7ba0c6b01b0ff26498f667f
ROOT="$(pwd)"

# JS 部分：官方 npm 包（bundle + 资产 + 类型）
curl -fsSL "https://registry.npmjs.org/@opentui/core/-/core-${VERSION}.tgz" -o core.tgz
tar -zxf core.tgz
rm core.tgz
mv package "${PKG}-${VERSION}"

# native 源码（curl tag tarball，不依赖容器里的 git）
curl -fsSL "https://github.com/anomalyco/opentui/archive/refs/tags/v${VERSION}.tar.gz" \
  -o "opentui-${VERSION}.tar.gz"
tar -zxf "opentui-${VERSION}.tar.gz"
rm "opentui-${VERSION}.tar.gz"

# zig 工具链（sha256 校验）
curl -fsSL --retry 5 -o zig.tar.xz \
  "https://ziglang.org/download/${ZIG_VERSION}/zig-aarch64-linux-${ZIG_VERSION}.tar.xz"
echo "${ZIG_SHA256}  zig.tar.xz" | sha256sum -c -
tar -xJf zig.tar.xz
rm zig.tar.xz
ZIG="${ROOT}/zig-aarch64-linux-${ZIG_VERSION}/zig"

# build.zig.zon 的 yoga 依赖是 git+https 形式，zig fetch 要调 git
brew install -y git

# 交叉编译：build runner 在容器 host 上执行，仅目标产物是 musl；
# install 路径为 packages/core/src/lib/aarch64-linux-musl/libopentui.so
cd "${ROOT}/opentui-${VERSION}/packages/core/src/zig"
"${ZIG}" build -Dtarget=aarch64-linux-musl -Doptimize=ReleaseFast

LIB="lib/aarch64-linux-musl/libopentui.so"
[ -f "$LIB" ] || { echo "no libopentui.so under lib/aarch64-linux-musl" >&2; exit 1; }
readelf -h "$LIB" | grep -q 'AArch64'
cp "$LIB" "${ROOT}/${PKG}-${VERSION}/libopentui.so"

cd "${ROOT}/${PKG}-${VERSION}"
patch -p1 < ../patchs/0001-update-package-json.patch
patch -p1 < ../patchs/0002-openharmony-loader.patch

# zig 自带 LLD 无 CodeSign patch，显式 strip + 签名
llvm-strip --strip-all libopentui.so
binary-sign-tool sign -selfSign 1 -inFile libopentui.so -outFile libopentui.so.signed
mv libopentui.so.signed libopentui.so
chmod +x libopentui.so

# --- 校验：包内容 / loader marker / ELF / dlopen 冒烟 ---

NAME=$(node -e "console.log(require('./package.json').name)")
[ "$NAME" = "@ohos-npm-ports/opentui-core" ]

for f in *.js; do
  node --check "$f"
done

for f in chunk-bun-t2myhmwd.js chunk-node-q0cwyvm9.js; do
  grep -q 'openharmony: "libopentui.so"' "$f"
  grep -q 'process.platform === "openharmony"' "$f"
done

readelf -h libopentui.so | grep -q 'AArch64'
readelf -S libopentui.so | grep -q '\.codesign'

# 本包经 npm alias override 消费（@opentui/core -> npm:@ohos-npm-ports/opentui-core），
# 包内 .js 若裸引 "@opentui/core" 将无法解析，必须用相对路径
if grep -rnE '(from|import\(|require\()"@opentui/core["/]' *.js; then
  echo "Bare @opentui/core self-import found (breaks npm alias override resolution)" >&2
  exit 1
fi

# optionalDependencies 指上游平台子包，必须钉住基础版本
node -e '
  const pkg = require("./package.json");
  const base = pkg.version.replace(/-.*$/, "");
  for (const [name, range] of Object.entries(pkg.optionalDependencies ?? {})) {
    if (name.startsWith("@opentui/core-") && range !== base) {
      console.error(`optionalDependencies["${name}"] = ${range}, expected ${base}`);
      process.exit(1);
    }
  }
'

python3 -c "
import ctypes
ctypes.CDLL('./libopentui.so')
print('libopentui.so dlopen: OK')
"

echo "OK: @ohos-npm-ports/opentui-core repacked with source-built core"

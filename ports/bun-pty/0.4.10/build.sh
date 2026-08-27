#!/bin/sh
set -e

# 容器 rust host triple 即 aarch64-unknown-linux-ohos，cargo 原生编译直接产出
# OHOS binding（链接期自动 codesign）
VERSION=0.4.10
PORTABLE_PTY_VERSION=0.9.0
PKG=bun-pty

curl -fsSL "https://github.com/sursaone/bun-pty/archive/refs/tags/v${VERSION}.tar.gz" -o bun-pty.tar.gz
tar -zxf bun-pty.tar.gz
rm bun-pty.tar.gz
# 解压目录恰为 ${PKG}-${VERSION}，无需改名

cd "${PKG}-${VERSION}"
patch -p1 < ../patchs/0001-package-json.patch
patch -p1 < ../patchs/0002-openharmony-loader.patch

brew install -y rust

# portable-pty 0.9.0 锁 nix 0.28（无 linux-ohos 支持）；[patch.crates-io] 不能改同仓
# 依赖版本，因此 vendor 后用 0003 打 nix bump（vendor 路径由 0002 写入 rust-pty/Cargo.toml）
mkdir -p rust-pty/vendor
FETCH_SCRATCH="$(pwd)/.fetch-portable-pty"
mkdir -p "${FETCH_SCRATCH}/src"
cat > "${FETCH_SCRATCH}/Cargo.toml" << 'CARGOEOF'
[package]
name = "fetch-scratch"
version = "0.1.0"
edition = "2021"

[dependencies]
portable-pty = "=0.9.0"
CARGOEOF
echo 'fn main() {}' > "${FETCH_SCRATCH}/src/main.rs"
(cd "${FETCH_SCRATCH}" && cargo fetch)
VENDOR_SRC=$(ls -d "$HOME"/.cargo/registry/src/*/portable-pty-${PORTABLE_PTY_VERSION} | head -1)
cp -r "$VENDOR_SRC" "rust-pty/vendor/portable-pty-${PORTABLE_PTY_VERSION}"
chmod -R u+w "rust-pty/vendor/portable-pty-${PORTABLE_PTY_VERSION}"
rm -rf "${FETCH_SCRATCH}"
cd "rust-pty/vendor/portable-pty-${PORTABLE_PTY_VERSION}"
patch -p1 < ../../../../patchs/0003-vendor-portable-pty-nix-bump.patch
cd ../../..

cd rust-pty
cargo build --release
cd ..

test -f rust-pty/target/release/librust_pty.so
llvm-strip --strip-all rust-pty/target/release/librust_pty.so
binary-sign-tool sign -selfSign 1 -inFile rust-pty/target/release/librust_pty.so -outFile rust-pty/target/release/librust_pty_arm64_ohos.so
rm rust-pty/target/release/librust_pty.so
chmod +x rust-pty/target/release/librust_pty_arm64_ohos.so

# 并入官方包其余 6 平台的 .so/.dylib/.dll，保持跨平台可用（files 白名单单包含多平台）
curl -fsSL "https://registry.npmjs.org/bun-pty/-/bun-pty-${VERSION}.tgz" -o official.tgz
tar -zxf official.tgz
cp package/rust-pty/target/release/*.so package/rust-pty/target/release/*.dylib package/rust-pty/target/release/*.dll rust-pty/target/release/ 2>/dev/null || true
rm -rf package official.tgz

npm install --ignore-scripts
export PATH="$(pwd)/node_modules/.bin:$PATH"
tsc --emitDeclarationOnly --declaration --outDir dist

# --- 校验：包内容 / ELF / 真实 PTY 冒烟 ---

NAME=$(node -e "console.log(require('./package.json').name)")
[ "$NAME" = "@ohos-npm-ports/bun-pty" ]

grep -q 'process.platform === "openharmony"' src/terminal.ts

readelf -h rust-pty/target/release/librust_pty_arm64_ohos.so | grep -q 'AArch64'
readelf -S rust-pty/target/release/librust_pty_arm64_ohos.so | grep -q '\.codesign'

# 本包是 bun:ffi 包，功能冒烟只能在 bun 下跑真实 PTY。部分容器缺 /system/lib 下
# musl loader 路径，先幂等补齐否则 OHOS 原生二进制无法执行
mkdir -p /system/lib
ln -sf /lib/ld-musl-aarch64.so.1 /system/lib/ld-musl-aarch64.so.1
brew tap social4hyq/core https://github.com/social4hyq/homebrew-core.git
brew trust social4hyq/core
brew install -y social4hyq/core/bun
bun --version

bun -e '
  import("./src/index.ts").then(async ({ spawn }) => {
    const term = spawn("/bin/sh", ["-c", "echo ohos-pty-smoke-test"], { name: "xterm", cols: 80, rows: 24 });
    let output = "";
    term.onData((data) => { output += data; });
    await new Promise((resolve) => term.onExit(resolve));
    if (!output.includes("ohos-pty-smoke-test")) {
      throw new Error("unexpected PTY output: " + JSON.stringify(output));
    }
    console.log("PTY spawn/read: OK");
  });
'

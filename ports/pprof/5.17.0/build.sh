#!/bin/sh
set -e

# node-gyp (nan) 容器原生编译
VERSION=5.17.0
PKG=pprof

curl -fsSL "https://github.com/DataDog/pprof-nodejs/archive/refs/tags/v${VERSION}.tar.gz" -o pprof.tar.gz
tar -zxf pprof.tar.gz
rm pprof.tar.gz
mv "pprof-nodejs-${VERSION}" "${PKG}-${VERSION}"

cd "${PKG}-${VERSION}"
patch -p1 < ../patchs/0001-update-package-json.patch

# --ignore-scripts 跳过 prepare（自带编译），node-gyp 非本包 devDep，显式装
npm install --ignore-scripts
npm install --ignore-scripts --no-save node-gyp
export PATH="$(pwd)/node_modules/.bin:$PATH"

npm run compile

# devel-base 的 cc 兼容壳要等 llvm@21 post_install 后才指向其 clang；容器旧 clang 15
# 缺 <source_location>（v8 头文件无条件引入），构建期必须显式装 llvm@21
brew tap social4hyq/core https://github.com/social4hyq/homebrew-core.git
brew trust social4hyq/core
brew install -y social4hyq/core/llvm@21

export CC=cc CXX=c++
node-gyp rebuild --jobs=max

# ABI 进 prebuild 文件名，漂移会导致运行时装载不到，宁硬失败
ABI=$(node -p process.versions.modules)
[ "$ABI" = "147" ] || { echo "unexpected ABI $ABI (expected 147)" >&2; exit 1; }

mkdir -p prebuilds/openharmony-arm64
cp "build/Release/dd_pprof.node" "prebuilds/openharmony-arm64/dd_pprof.node.abi${ABI}.node"

cd prebuilds/openharmony-arm64
llvm-strip --strip-all "dd_pprof.node.abi${ABI}.node"
binary-sign-tool sign -selfSign 1 -inFile "dd_pprof.node.abi${ABI}.node" -outFile "dd_pprof.node.abi${ABI}.node.signed"
mv "dd_pprof.node.abi${ABI}.node.signed" "dd_pprof.node.abi${ABI}.node"
chmod +x "dd_pprof.node.abi${ABI}.node"
cd ../..

# 并入其余 5 平台官方 prebuilds，保持跨平台可用（同 bufferutil 的单包单树模式）
curl -fsSL "https://registry.npmjs.org/@datadog/pprof/-/pprof-${VERSION}.tgz" -o official.tgz
tar -zxf official.tgz
cp -r package/prebuilds/darwin-arm64 package/prebuilds/darwin-x64 \
      package/prebuilds/linux-arm64 package/prebuilds/linux-x64 \
      package/prebuilds/win32-x64 prebuilds/
rm -rf package official.tgz

# 删除本地产物副本，防止下方解析检查被 build/Release 快路径误导
rm -rf build

# --- 校验：包内容 / ELF / 解析器 / 真实 profiler 冒烟 ---

NAME=$(node -e "console.log(require('./package.json').name)")
[ "$NAME" = "@ohos-npm-ports/datadog-pprof" ]

[ -z "$(node -e "console.log(require('./package.json').postinstall || '')")" ]

readelf -h "prebuilds/openharmony-arm64/dd_pprof.node.abi${ABI}.node" | grep -q 'AArch64'
readelf -S "prebuilds/openharmony-arm64/dd_pprof.node.abi${ABI}.node" | grep -q '\.codesign'

RESOLVED=$(node -e "console.log(require('./node_modules/node-gyp-build').resolve('.'))")
case "$RESOLVED" in
  */prebuilds/openharmony-arm64/dd_pprof.node.abi"${ABI}".node) ;;
  *) echo "node-gyp-build resolved to unexpected path: $RESOLVED" >&2; exit 1 ;;
esac

# 冒烟需真实加载 addon：其调用的宿主导出 v8:: 符号修饰名含 stdlib ABI 标记，
# 只有与 llvm@21 libc++(__n1) 同源的运行时可载入——即 social4hyq/core 的 bun
# （上游验收测试同样以 bun 运行；harmonybrew node 是 GNU libstdc++，不匹配）。
# 部分容器缺 /system/lib 下 musl loader 路径，先幂等补齐否则 OHOS 原生二进制无法执行
mkdir -p /system/lib
ln -sf /lib/ld-musl-aarch64.so.1 /system/lib/ld-musl-aarch64.so.1
brew install -y social4hyq/core/bun
bun --version

bun -e '
  const { time } = require("./out/src/index.js");

  function hotLoop() {
    const start = Date.now();
    let acc = 0;
    while (Date.now() - start < 300) {
      for (let i = 0; i < 1000; i++) acc += Math.sqrt(i);
    }
    return acc;
  }

  time.start({ intervalMicros: 1000, durationMillis: 60000 });
  hotLoop();
  const profile = time.stop();

  const strings = profile.stringTable.strings;
  const summary = {
    sampleCount: profile.sample.length,
    locationCount: profile.location.length,
    functionCount: profile.function.length,
    hasHotLoop: strings.includes("hotLoop"),
  };
  console.log("TimeProfiler summary:", JSON.stringify(summary));
  if (summary.sampleCount === 0 || !summary.hasHotLoop) {
    throw new Error("smoke test failed: no samples or missing hotLoop frame");
  }
'

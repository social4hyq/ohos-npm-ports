#!/bin/sh
set -e

# 槽位包先发：主包 optionalDependencies 指向它，先发才能做到装上即可解析（同 next 双包纪律）。
# 第一条 cd 是门禁（smoke-port.sh / validate-port.sh）解析的产物目录行，必须自包含——
# 门禁把 `cd ` 之后那串丢进一个干净的 sh -c 里 eval，除 $0 外没有变量可用，
# 所以用 $(dirname "$0") 前缀（parcel-watcher-openharmony-arm64 / next 先例）。
cd "$(dirname "$0")/build/typescript-openharmony-arm64"
npm publish --tag latest --access public

cd "$(dirname "$0")/build/typescript-7.0.2"
npm publish --tag latest --access public

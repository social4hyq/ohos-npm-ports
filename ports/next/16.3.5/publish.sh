#!/bin/sh
set -e

# 平台子包先发：主包的 optionalDependencies 指向它，先发才能做到装上即可解析。
# 第一条 cd 就是仓库门禁（validate-port.sh / smoke-port.sh）解析的「产物目录」行，
# 必须自包含——门禁把 `cd ` 之后那串丢进一个干净的 sh -c 里 eval，除 $0 外没有
# 任何变量可用，所以写 $ROOT 那种前面赋的变量会解析失败（parcel-watcher-
# openharmony-arm64 先例用 $(dirname "$0")）。
cd "$(dirname "$0")/next-swc-openharmony-arm64"
npm publish --tag latest --access public

# 第二条相对子包目录回到 port 目录再进主包（与 $0 无关，$0 是相对还是绝对都对）。
cd ../next-16.3.5
npm publish --tag latest --access public

#!/bin/sh
set -e

# 槽位包先发，主包 optionalDependencies 才能装上即解析。
# 第一条 cd 为产物目录行，须自包含定位（$(dirname "$0") 前缀）。
# ci.yml 在 PORTS_RELEASE 模式下会把发布命令换成打包, 产物落到 artifacts/,
# 以便挂到 release。注释里不要出现该命令的字面形式, 否则一并被替换。
cd "$(dirname "$0")/build/pnpm-openharmony-arm64"
npm publish --tag latest --access public

cd ../pnpm-wrapper-12.8.1
npm publish --tag latest --access public

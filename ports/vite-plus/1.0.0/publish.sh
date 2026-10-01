#!/bin/sh
set -e

# ci.yml 在 PORTS_RELEASE 模式下会把下面的发布命令换成打包, 产物落到 artifacts/,
# 以便挂到 release。注释里不要出现该命令的字面形式, 否则一并被替换。

cd vite-plus-1.0.0

npm publish --tag latest --access public
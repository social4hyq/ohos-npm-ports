#!/bin/sh
set -e

cd "yuku-core-0.19.0"

npm publish --tag latest --access public

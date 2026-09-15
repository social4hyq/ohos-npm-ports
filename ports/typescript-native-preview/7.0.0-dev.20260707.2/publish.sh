#!/bin/sh
set -e

cd build/typescript-native-preview-7.0.0-dev.20260707.2

npm publish --tag latest --access public

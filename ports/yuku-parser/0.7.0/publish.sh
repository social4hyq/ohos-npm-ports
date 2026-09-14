#!/bin/sh
set -e

cd "yuku-parser-0.7.0"

npm publish --tag legacy-0.7 --access public

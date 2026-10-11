#!/bin/sh
set -e

cd bun-pty-0.4.10

npm publish --ignore-scripts --tag latest --access public

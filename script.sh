#!/usr/bin/env bash

set -e
set -u
set -o pipefail
set -x

npm run clean
npm i
npm run build
PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install
npm run ctest -- --reporter=line

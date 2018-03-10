#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

# Lint every file under /server
printf "Linting server.index\n"
eslint --config .eslintrc.js server/index.js
printf "Linting server.app.db\n"
eslint --config .eslintrc.js server/app/db.js
printf "Linting server.app.spider\n"
eslint --config .eslintrc.js server/app/spider.js
printf "Linting server.app.index\n"
eslint --config .eslintrc.js server/app/index.js
printf "Completed - Code adheres to standard\n"
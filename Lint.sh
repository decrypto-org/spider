#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

# Lint every file under /server
printf "Linting server.index\n"
eslint --config .eslintrc.js --fix server/index.js
# deactivated until model based approach is implemented
printf "Linting server.app.conductor\n"
eslint --config .eslintrc.js --fix server/app/conductor.js
printf "Linting server.app.spider\n"
eslint --config .eslintrc.js --fix server/app/spider.js
printf "Linting server.app.network\n"
eslint --config .eslintrc.js --fix server/app/network.js
printf "Linting server.app.parser\n"
eslint --config .eslintrc.js --fix server/app/parser.js
printf "Linting server.app.index\n"
eslint --config .eslintrc.js --fix server/app/index.js
printf "Linting server.app.library.logger\n"
eslint --config .eslintrc.js --fix server/app/library/logger.js
printf "Linting server.app.extensions.Set\n"
eslint --config .eslintrc.js --fix server/app/extensions/Set.js
eslint --config .eslintrc.js --fix server/app/extensions/Set/
printf "Linting server.app.extensions.Object\n"
eslint --config .eslintrc.js --fix server/app/extensions/Object.js
printf "Linting models\n"
eslint --config .eslintrc.js --fix server/app/models/**
printf "Linting events\n"
eslint --config .eslintrc.js --fix server/app/events/**
printf "Linting library\n"
eslint --config .eslintrc.js --fix server/app/library/**
printf "Linting tests\n"
eslint --config .eslintrc.js --fix server/test/**
printf "Linting uriExtractor.extractor\n"
eslint --config .eslintrc.js --fix uriExtractor/extractor.js
printf "Linting dataPreprocessing.models\n"
eslint --config .eslintrc.js --fix dataPreprocessing/models/**
printf "Linting dataPreprocessing.index\n"
eslint --config .eslintrc.js --fix dataPreprocessing/index.js
printf "Completed - Code adheres to standard\n"
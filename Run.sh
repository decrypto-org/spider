#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

# Note: I'll add code as needed later (e.g. copy code to container)

docker stop tdse_spider 2>&1 > /dev/null && :
docker rm tdse_spider 2>&1 > /dev/null && :

docker run -i -t -p 5432:5432 --name tdse_spider tdse_spider/main:latest
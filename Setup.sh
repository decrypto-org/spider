#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset


docker build --rm -t robrunne/tdse-dependencies:1.0.0 deployment/
docker build -t robrunne/tdse-spider:1.0.0 server/
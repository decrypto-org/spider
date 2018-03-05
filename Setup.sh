#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset


docker build --rm -t robrunne/tdse_dependencies:1.0.0 deployment/
docker build -t robrunne/tdse-spider:1.0.0 server/
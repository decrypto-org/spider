#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset


docker build --rm -t robrunne/tdse-py-dep:1.0.0 -f deployment/pythonBase/Dockerfile .
docker build --rm -t robrunne/tdse-dependencies:1.0.0 -f deployment/Dockerfile .
docker build -t robrunne/tdse-spider:1.0.0 server/

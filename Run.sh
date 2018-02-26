#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

# Note: I'll add code as needed later (e.g. copy code to container)

echo "Start PostgreSQL container"
docker stack deploy -c stack.yml postgres

#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

# Note: I'll add code as needed later (e.g. copy code to container)

docker stack deploy -c deployment/stack.yml spider

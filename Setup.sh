#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

echo "Creating volume for PostgreSQL"
docker volume create postgres-vol

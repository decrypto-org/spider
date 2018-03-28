#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

# Note: I'll add code as needed later (e.g. copy code to container)
backup_var=${tdse_server_start_command:-""}
tdse_server_start_command="npm start"
if [ "$1" = "test" ]; then
	printf "Starting containers for testing"
	tdse_server_start_command="bash"
elif [ "$1" = "debug" ]; then
	printf "Starting containers in debug mode"
	tdse_server_start_command="npm run debug"
else
	printf "Starting containers in productive mode"
fi

docker stack deploy -c deployment/stack.yml spider
tdse_server_start_command=$backup_var

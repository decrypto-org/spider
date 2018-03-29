#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

arg=${1:-}
export tdse_server_start_command="npm start"
if [ "$arg" = "test" ]; then
	printf "Starting containers for testing"
	export tdse_server_start_command="/bin/bash"
elif [ "$arg" = "debug" ]; then
	printf "Starting containers in debug mode"
	export tdse_server_start_command="npm run debug"
else
	printf "Starting containers in productive mode"
fi

printf "Current value of tdse_server_start_command: %s\n" "$tdse_server_start_command"

{ docker stack deploy -c deployment/stack.yml spider; }


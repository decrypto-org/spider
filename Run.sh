#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

arg=${1:-}
export tdse_server_start_command="npm start -i /home/node/init_urls.csv"
if [ "$arg" = "shell" ]; then
	printf "Starting containers for direct manipulation over shell\n"
	export tdse_server_start_command="/bin/bash"
	{ docker-compose up -d; }
elif [ "$arg" = "debug" ]; then
	printf "Starting containers in debug mode\n"
	export tdse_server_start_command="npm run debug -i /home/node/init_urls.csv"
	{ docker-compose up -d; }
elif [ "$arg" = "test" ]; then
	printf "Starting container in testing mode\n"
	export tdse_server_start_command="npm test"
	{ docker-compose up -d; }
else
	printf "Starting containers in productive mode\n"
	{ docker-compose up -d; }
fi

printf "Current value of tdse_server_start_command: %s\n" "$tdse_server_start_command"



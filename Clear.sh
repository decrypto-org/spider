#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

echo "Do you want to only delete intermediary containers or also the data volumes? [i=intermediary/d=data]"
read remove_data

if [[ "${remove_data}" == "d" ]]; 
	then
		echo "This will delete all data collected. Are you sure that you want to proceed? [yes/N]"
		read proceed_answer
	else
		proceed_answer="N"
fi

if [[ "${proceed_answer}" == "yes" ]];
	then
		echo "Removing data volumes"
		docker volume rm postgres-vol
fi

echo "Removing docker container"


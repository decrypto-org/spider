#!/bin/bash
# ============ preamble ================== #
set -o errexit
set -o pipefail
set -o nounset

git clone https://github.com/dotcloud/docker-registry.git
cd docker-registry
cp config_sample.yml config.yml
pip install -r requirements.txt
gunicorn --access-logfile - --log-level debug  --debug -b 0.0.0.0:5000 -w 1 wsgi:application
#!/bin/bash
set -e

docker build -t robrunne/tor-proxy:1.0.0 deployment/tor
docker build --no-cache -t robrunne/tdse-spider:1.0.0 server/
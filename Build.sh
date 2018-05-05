#!/bin/bash
set -e

docker build -t robrunne/tor-router:1.0.0 deployment/tor
docker build -t robrunne/tdse-spider:1.0.0 server/
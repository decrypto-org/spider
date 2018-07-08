#!/bin/bash
set -e

docker build -t robrunne/tor-proxy:1.0.0 deployment/tor
docker build -t robrunne/tdse-spider:1.0.0 -f server/Dockerfile .
docker build -t robrunne/tdse-uri-extractor:1.0.0 -f uriExtractor/Dockerfile .
docker build -t robrunne/tdse-data-preprocessor:1.0.0 -f dataPreprocessing/Dockerfile .
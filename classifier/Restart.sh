#!/bin/bash
set -e

docker-compose stop classifier
docker rm spider_classifier_1
docker build -t robrunne/tdse-classifier:1.0.0 -f ./Dockerfile ..
docker-compose up -d classifier
docker attach spider_classifier_1


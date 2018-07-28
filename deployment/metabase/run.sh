docker create -it -p 10003:3000 -v ~/metabase:/metabase-data --net="spider_backend" --name metabase metabase/metabase
docker network connect bridge metabase 
docker start metabase

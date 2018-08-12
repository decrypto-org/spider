FROM robrunne/tdse-py-dep:1.0.0
WORKDIR /usr/src/tdse/spider/classifier

RUN useradd -ms /bin/bash node

COPY ./classifier .

COPY ./server/.env ./

RUN chown -R node:node /usr/src/tdse/spider/classifier/outputModels

# Node JS Debug Port
EXPOSE 9101
EXPOSE 5858
EXPOSE 65001

USER node
ENV HOME /home/node

ENV TDSE_DB_HOST=database

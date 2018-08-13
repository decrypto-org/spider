FROM robrunne/tdse-py-dep:1.0.0
WORKDIR /usr/src/tdse/spider/classifier

RUN useradd -ms /bin/bash node

COPY ./classifier .

COPY ./server/.env ./

RUN chown -R node:node /usr/src/tdse/spider/classifier/outputModels

RUN mkdir /home/node/log

RUN chown -R node:node /home/node/log

# Node JS Debug Port
EXPOSE 9101
EXPOSE 5858

USER node
ENV HOME /home/node

ENV TDSE_DB_HOST=database

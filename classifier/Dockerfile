FROM robrunne/tdse-dependencies:1.0.0

WORKDIR /usr/src/tdse/spider/classifier

COPY ./classifier/package*.json ./

RUN npm install ../../textract

RUN npm install

COPY ./classifier .

COPY ./server/.env ./

# Node JS Debug Port
EXPOSE 9101
EXPOSE 5858
EXPOSE 65001

USER node
ENV HOME /home/node

ENV TDSE_DB_HOST=database

FROM robrunne/tdse-dependencies:1.0.0

WORKDIR /usr/src/tdse/spider/classifier

COPY ./classifier .

RUN npm install ../../textract

RUN npm install

RUN mkdir models

COPY ./dataPreprocessing/models ./models

COPY ./server/.env ./

WORKDIR /usr/src/tdse/spider/classifier/node-svm

RUN npm install

WORKDIR /usr/src/tdse/spider/classifier

# Node JS Debug Port
EXPOSE 9101
EXPOSE 5858
EXPOSE 65001

USER node
ENV HOME /home/node

ENV TDSE_DB_HOST=database

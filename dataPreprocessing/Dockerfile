FROM robrunne/tdse-prepbase:1.0.0

WORKDIR /usr/src/tdse/spider/dataPreprocessing

COPY ./dataPreprocessing/package*.json ./

RUN npm install ../../textract

RUN npm install

COPY ./dataPreprocessing .

COPY ./server/.env ./

# Connection to the database
EXPOSE 10864

# Node JS Debug Port
EXPOSE 9101
EXPOSE 5858
EXPOSE 65001

USER node
ENV HOME /home/node

ENV TDSE_DB_HOST=database
ENV TDSE_TOR_HOST=frontend

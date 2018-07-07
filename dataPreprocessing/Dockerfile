FROM robrunne/tdse-dependencies:1.0.0

WORKDIR /usr/src/tdse/spider/server

COPY ./server .

RUN npm install -g npm

RUN npm install

WORKDIR /usr/src/tdse

RUN git clone https://github.com/jogli5er/textract

WORKDIR /usr/src/tdse/textract

COPY ./server/.env ./

RUN npm install

RUN npm install .

WORKDIR /usr/src/tdse/spider/dataPreprocessing

COPY ./server/.env ./

COPY ./dataPreprocessing/package*.json ./

RUN npm install -g npm

RUN npm install ../../textract

RUN npm install

COPY ./dataPreprocessing .

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

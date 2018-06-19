FROM robrunne/tdse-dependencies:1.0.0

WORKDIR /usr/src/tdse/spider

COPY package*.json ./

RUN npm install -g npm

RUN npm install

COPY . .

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

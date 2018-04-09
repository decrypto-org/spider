FROM robrunne/tdse-dependencies:1.0.0

WORKDIR /usr/src/tdse/spider

COPY package*.json ./

COPY . .

RUN npm install

# Connection to the database
EXPOSE 10864

# Node JS Debug Port
EXPOSE 9101
EXPOSE 5858

USER node
ENV HOME /home/node

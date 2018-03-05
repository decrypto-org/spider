FROM robrunne/tdse_dependencies:1.0.0

WORKDIR /usr/src/tdse/spider

COPY package*.json ./

COPY . .

RUN npm install

# Connection to the database
EXPOSE 10864

# Connection to the Tor Network
EXPOSE 9000-10000

# Node JS Debug Port
EXPOSE 5858

CMD [ "npm", "start" , ">>/log/spider.log", "2>>/log/spider.error"]

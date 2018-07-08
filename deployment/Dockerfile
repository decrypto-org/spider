# Base Dockerfile to not always reinstall TOR

FROM node:carbon

RUN printf "deb http://deb.debian.org/debian jessie-backports main contrib\n" > /etc/apt/sources.list.d/jessie-backports.list
RUN printf "deb http://deb.debian.org/debian jessie-backports-sloppy main contrib" >> /etc/apt/sources.list.d/jessie-backports.list
RUN apt-get update && apt-get install -y --no-install-recommends apt-utils
RUN apt install -y tor
RUN apt install -y net-tools
RUN apt install -y telnet
RUN apt install -y vim
RUN apt update -y

# Install textract and the server, since both contain
# code, which is needed basically everywhere
WORKDIR /usr/src/tdse

RUN git clone https://github.com/jogli5er/textract

WORKDIR /usr/src/tdse/textract

COPY ./server/.env ./

WORKDIR /usr/src/tdse/spider/server

COPY ./server .

RUN npm install -g npm

RUN npm install ../../textract

RUN npm install

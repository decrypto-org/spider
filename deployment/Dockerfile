# Base Dockerfile to not always reinstall TOR

FROM node:9.7

RUN printf "deb http://deb.debian.org/debian jessie-backports main contrib\n" > /etc/apt/sources.list.d/jessie-backports.list
RUN printf "deb http://deb.debian.org/debian jessie-backports-sloppy main contrib" >> /etc/apt/sources.list.d/jessie-backports.list
RUN apt update -y
RUN apt install -y tor
RUN apt install -y net-tools
RUN apt install -y telnet
RUN apt update -y
FROM postgres:10

RUN apt-get update -y -qq
RUN apt-get install python3 -y -qq

RUN apt-get install python3-pip -y -qq

RUN apt-get install python3-setuptools python3-dev build-essential -y

RUN pip3 install pgxnclient

RUN pgxn install quantile

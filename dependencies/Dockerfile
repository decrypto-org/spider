# ------------- #
# BASE OS SETUP #
# ------------- #

FROM library/postgres:10.2
MAINTAINER Roman Brunner, robrunne@student.ethz.ch

# setup directory structure (NOTE: When changing the directories, update the directories in start.sh as well)
ENV TDSE_HOME /home/tdse
ENV TDSE_LIB $TDSE_HOME/lib

RUN apt -qq update
RUN apt -qq -y install curl
RUN curl -sL https://deb.nodesource.com/setup_6.x | bash -
RUN apt -qq -y install nodejs

# Now, NPM should be ready to be used. See you in the 
# Descending Dockerfile (We do not need to rebuild this dockerfile everytime)
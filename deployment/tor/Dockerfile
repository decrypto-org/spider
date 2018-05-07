# Dockerfile for TOR router. We basically only want to
# change the user running the server. This should prevent
# some issues if the instance gets compromised.

# Further this allows us to override the default settings in
# the provided dockerfile and therefor setting our own parameters
# for startup

FROM robrunne/tor-router:1.0.0

RUN apt update -y
RUN apt install -y htop
# somehow docker complained that tor is not in the pwd file.
# the same worked for the spider, however, I suspect that the node user
# is already created in the node js base image
RUN useradd -ms /bin/bash tor

USER tor
ENV HOME /home/tor


ENTRYPOINT [ "tor-router" ]
# If the control port is set to something else than 9077,
# please also update the .env file
CMD [ "-j", "0", "-c", "9077"]

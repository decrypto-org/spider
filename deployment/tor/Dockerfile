# Dockerfile for TOR router. We basically only want to
# change the user running the server. This should prevent
# some issues if the instance gets compromised.

# Further this allows us to override the default settings in
# the provided dockerfile and therefor setting our own parameters
# for startup

FROM robrunne/tor-router:1.0.0

RUN apt update -y -qq
RUN apt install -y -qq htop
RUN apt install --reinstall -y -qq iptables
# The commands below cannot be done in the build process
# since docker does not support privileged operations
# during the build process.
# RUN apt install -y -qq iptables-persistent 
# RUN iptables -A INPUT -m conntrack --cstate ESTABLISHED,RELATED -j ACCEPT
# RUN iptables -A OUTPUT -m conntrack --cstate ESTABLISHED,RELATED -j ACCEPT
# RUN iptables -A INPUT -s 172.16.0.0/12 -j ACCEPT
# RUN iptables -P INPUT REJECT
# RUN iptables -P OUTPUT REJECT
# somehow docker complained that tor is not in the pwd file.
# the same worked for the spider, however, I suspect that the node user
# is already created in the node js base image
RUN useradd -ms /bin/bash tor

USER tor
ENV HOME /home/tor


ENTRYPOINT [ "tor-router" ]
# If the control port is set to something else than 9077,
# please also update the .env file
CMD [ "-j", "100", "-c", "9077", "-s", "9000"]

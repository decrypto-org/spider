# We now only need this in order to not have to change
# the start parameters in the library code but in our codebase

FROM robrunne/tor-router:1.0.0

ENTRYPOINT [ "tor-router" ]
# If the control port is set to something else than 9077,
# please also update the .env file
CMD [ "-j", "100", "-c", "9077", "-s", "9000"]

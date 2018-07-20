# Not actually needed anymore... Keeping, since we have set up everything
# with it already and it may come in handy later, if we want to change
# or add components to the image. For now it is just here

FROM robrunne/tor-router:1.0.0

ENTRYPOINT [ "tor-router" ]
# If the control port is set to something else than 9077,
# please also update the .env file
CMD [ "-j", "100", "-c", "9077", "-s", "9000"]

Comment style: Google (https://google.github.io/styleguide/jsguide.html#formatting-comments)
<br>
Private methods, fields: Start with an underscore. E.g. <code>var _private = 1;</code>
<br>
Darknet testwebsite: https://msydqstlz2kzerdg.onion/ (ahmia.fi, was always available in the past)
<br>
Requires the following packets
<br>
Requires the following environment variables:
TDSE_HOST_SPIDER_REPO: Points to the root of the git repository (this directory)
TDSE_DB_USER: The user name for the postgres db backend
TDSE_DB_PASSWORD: The password for the user specified above
TDSE_DB_NAME: The name of the DB
TDSE_DB_HOST: The DB Host. If run in docker container, this corresponds to the specified aliases in stack.yml, otherwise one wants to typically choose either localhost or similar
TDSE_DB_PORT: DB Port 
TDSE_SEARCH_DEPTH: The depth until we stop following links to other pages.
This cutoff value allows us, to test with fewer load on the network.
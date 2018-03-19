Comment style: Google (https://google.github.io/styleguide/jsguide.html#formatting-comments)
Your code will be linted by travis. However, with Lint.sh, you can lint your<br>
files yourself. Please register any new file in Lint.sh
<br>
Darknet testwebsite: https://msydqstlz2kzerdg.onion/ (ahmia.fi, was always available in the past)
<br>
Requires the following packets
<br>
Requires the following environment variables:<br>
TDSE_HOST_SPIDER_REPO: Points to the root of the git repository (this directory)<br>
TDSE_DB_USER: The user name for the postgres db backend<br>
TDSE_DB_PASSWORD: The password for the user specified above<br>
TDSE_DB_NAME: The name of the DB<br>
TDSE_DB_HOST: The DB Host. If run in docker container, this corresponds to the<br>
specified aliases in stack.yml, otherwise one wants to typically choose either<br>
localhost or similar<br>
TDSE_DB_PORT: DB Port <br>
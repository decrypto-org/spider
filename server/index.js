var { logger } = require("./app/library/logger");

var dotenv = require("dotenv");
var variableExpansion = require("dotenv-expand");

/* eslint-disable no-unused-vars */
var spiderEnv = dotenv.config();
spiderEnv = variableExpansion(spiderEnv);
/* eslint-enable no-unused-vars */

process.on("uncaughtException", (err) => {
	console.error((err && err.stack) ? err.stack : err);
});

const main = require("./app/index");
logger.log("info", "Loaded app/index");

logger.log("info", "Starting spider");
main.init();

let {logger} = require("./app/library/logger");

let dotenv = require("dotenv");
let variableExpansion = require("dotenv-expand");

/* eslint-disable no-unused-vars */
let spiderEnv = dotenv.config();
spiderEnv = variableExpansion(spiderEnv);
/* eslint-enable no-unused-vars */

process.on("uncaughtException", (err) => {
    console.error((err && err.stack) ? err.stack : err);
});

const main = require("./app/index");
logger.log("info", "Loaded app/index");

logger.log("info", "Starting spider");
main.init();

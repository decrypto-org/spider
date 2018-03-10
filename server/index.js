/* eslint-disable no-unused-vars */
var format = require("node.date-time");
/* eslint-enable no-unused-vars */
var dotenv = require("dotenv");
var variableExpansion = require("dotenv-expand");

/* eslint-disable no-unused-vars */
var spiderEnv = dotenv.config();
spiderEnv = variableExpansion(spiderEnv);
/* eslint-enable no-unused-vars */

console.log(process.env.DB_HOST);

process.on("uncaughtException", (err) => {
	console.error((err && err.stack) ? err.stack : err);
});

var date = new Date().format("d.M.Y H:m:S");
console.log("Spider started@{" + date + "}");

const main = require("./app/index");
console.log("Loaded app/index");

console.log("Starting spider");
main.init();

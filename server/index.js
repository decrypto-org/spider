var format = require('node.date-time');
var fs = require('fs');
var dotenv = require('dotenv');
var variableExpansion = require('dotenv-expand');

var spiderEnv = dotenv.config()
spiderEnv = variableExpansion(spiderEnv);
// spiderEnv = envParser(spiderEnv);

console.log(process.env.DB_HOST);

var fsoptions = {
	flags: 'a'
}

process.on('uncaughtException', (err) => {
	console.error((err && err.stack) ? err.stack : err);
});

var date = new Date().format('d.M.Y H:m:S')
console.log("Spider started@{" + date + "}");

const main = require('./app/index');
console.log("Loaded app/index");

console.log("Starting spider");
main.init();

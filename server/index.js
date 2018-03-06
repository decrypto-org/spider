var format = require('node.date-time');
var fs = require('fs');

var fsoptions = {
	flags: 'a'
}

var accessLog = fs.createWriteStream("/log/spider.log", fsoptions);
process.stdout.write = accessLog.write.bind(accessLog);

var accessError = fs.createWriteStream("/log/spider.error", fsoptions);
process.stderr.write = accessError.write.bind(accessError);

process.on('uncaughtException', (err) => {
	console.error((err && err.stack) ? err.stack : err);
});

var date = new Date().format('d.M.Y H:m:S')
console.log("Spider started@{" + date + "}");

const main = require('./app/index');
console.log("Loaded app/index");

console.log("Starting spider");
main.init();

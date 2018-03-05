var format = require('node.date-time');

var date = new Date().format('d.M.Y H:m:S')
console.log("Spider started@{" + date + "}");

const main = require('./app/index');
console.log("Loaded app/index");

console.log("Starting spider");
main.init();

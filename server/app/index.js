const spider = require('./spider')

exports.init = function(){
	spider.start_spider();
};

process.on('exit', (code) => {
	if (code == 0)
		return console.log(`Spider finished, shutting down`);
	else
		return console.log("An error occured. Please have a look at the logs");
});
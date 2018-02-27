const postgres = require('pg')

const spider = require('./spider')

exports.init = function(){
	// Set up db connection
	
	// Start spidering (Probably pass instance of db over)
	spider.start_spider();
};

process.on('exit', (code) => {
	if (code == 0)
		return console.log(`Spider finished, shutting down`);
	else
		return console.log("An error occured. Please have a look at the logs");
});
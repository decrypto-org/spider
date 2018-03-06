const { Spider } = require('./spider');
const { DB } = require('./db');
const format = require('node.date-time');

const portscanner = require('portscanner');

exports.init = async function(){
	// First initialize the db module
	var db = new DB();

	// Find available port to run tor on
	portscanner.findAPortNotInUse(9000, 9100, '127.0.0.1', (error, tor_port) => {
		if(error) {
			console.error('No open ports found. Check if other instances are running and kill them.', error);
			process.exit(-1);
		}
		// now we can initialize the spider
		// We pass the DB module instance from above to make sure we are using
		// the same object (require does not guarantee this in every environment)
		var spider = new Spider(tor_port, ["msydqstlz2kzerdg.onion"] /* start_urls */, 1 /* depth */, db);
	});
};

process.on('exit', (code) => {
	var date = new Date().format('d.M.Y H:m:S')
	console.log("Spider shutdown@{" + date + "}");
	if (code == 0)
		return console.log(`Spider finished, shutting down`);
	else
		return console.log("An error occured. Please have a look at the logs");
});
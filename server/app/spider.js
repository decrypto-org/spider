const readline = require('readline');
const rl = readline.createInterface(process.stdin, process.stdout, null);
const htmlparser = require('htmlparser2');

class Spider{
	constructor(start_urls, depth){
		this._start_urls = new Set(start_urls);
		this._visited_urls = new Set();
		this._init_depth = depth;
	}

	scrape(url){

	}

	start_spidering(){
		var new_found_urls = new Set();
		for(let url in this._start_urls){

		}
		// new_found_urls now only contain those urls that haven't been visited before
		new_found_urls = new_found_urls.difference(this._visited_urls);

		// We now have to ensure that start_urls also do not contain any already visited urls
		this._start_urls = this._start_urls.difference(this._visited_urls);

		this._start_urls = new Set([...this._start_urls, ...new_found_urls]);
	}

	add_url(url){

	}

	append_urls(urls){

	}
}

exports.start_spider = function(){
	var spider;
	rl.question("Give a starting point for our darknet spider (a .onion address):\n", function(url) {
		console.log("Start url: " + url);
		spider = new Spider(url, 1);
	});
	spider.start_spidering();
}

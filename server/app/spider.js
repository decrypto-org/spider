// require('./extensions/');
const readline = require('readline');
const rl = readline.createInterface(process.stdin, process.stdout, null);
var TorAgent = require('toragent');
var request = require('request');
var cheerio = require('cheerio');

class Spider{
	constructor(start_urls, depth){
		// Please note: only start the spider, when the tor agent is set
		console.log("start_url: " + start_urls);
		this._start_urls = new Set(start_urls);
		console.log("this._start_urls: " + JSON.stringify(this._start_urls));
		this._visited_urls = new Set();
		this._init_depth = depth;
		this._tor_agent = null;
	}

	scrape(url){
		// returns a tuple of url, content and list of found urls (content for later classification)
		request({
			method: 'GET',
			url: url,
			agent: this._tor_agent
		}, function(err, response, body){
			if (err) return console.error(err);

			$ = cheerio.load(body);
			/* Since the Torbrowser by default deactivates JS, we don't see JS that often, therefor we can fully rely on <a href > links, without missing too much information.
			 * In this case we have the following scenarios:
			 *	- href starts with # --> ignore, this is an anchor on the site we already fetched, no need to follow
			 *	- href starts with / or ? --> Prepend URL and add to list of found URLs (Same server, but different page. Might contain other information)
			 *	- href either starts with http://, https:// or any alphanumeric character --> new external link (yay, possible new website). Store in link list
			 */
			$("a").each(function(index){
				console.log(index + ": " + $(this).text());
			});
		});
	}

	set tor_agent(tor_agent){
		this._tor_agent = tor_agent;
	}

	start_spidering(){
		console.log("Start spidering");
		var new_found_urls = new Set();
		console.log("iterate through urls");
		console.log("this._start_urls: " + Array.from(this._start_urls));
		var iteratable_url_array = Array.from(this._start_urls);
		for(let index in iteratable_url_array){
			console.log("URL: " + iteratable_url_array[index]);
			this.scrape(iteratable_url_array[index]);
		}
		// new_found_urls now only contain those urls that haven't been visited before
		new_found_urls = new_found_urls.difference(this._visited_urls);

		// We now have to ensure that start_urls also do not contain any already visited urls
		this._start_urls = this._start_urls.difference(this._visited_urls);

		this._start_urls = this._start_urls.union(this._visited_urls);
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
		spider = new Spider([url], 1 /* depth */);

		spider.start_spidering();
		// TorAgent.create(true).then(function(agent){
		// 	spider.tor_agent = agent;
		// 	spider.start_spidering();
		// });
		process.exit(0);
	});
}

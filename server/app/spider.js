require('./extensions/');

const readline = require('readline');
const http = require('http');
const rl = readline.createInterface(process.stdin, process.stdout, null);

const request = require('request');
const cheerio = require('cheerio');
const nightlink = require('nightlink');
const ProxyAgent = require('proxy-agent');

// Local/module private constants:
var _port = 9050;

class Spider{
	constructor(start_urls, depth){
		// Please note: only start the spider, when the tor agent is set
		console.log("start_url: " + start_urls);
		this._start_urls = new Set(start_urls);
		console.log("this._start_urls: " + this._start_urls);
		this._visited_urls = new Set();
		this._init_depth = depth;
		this._tor_agent = null;
	}


	extract_data(body){
		console.log("Extracting data");
	}

	async scrape(url){
		console.log("[spider.scrape] == Params: url=" + url);
		// stores a tuple of url, content and list of found urls (content for later classification) in the database
		var proxyUri = 'socks://127.0.0.1:' + _port;

		var request = {
			method: 'GET',
			host: url,
			path: '/',
			agent: new ProxyAgent(proxyUri)
		};

		const onresponse = async (response) => {  // replace code below with a callback function
			console.log(response.statusCode, response.headers);

			const { statusCode } = response;
			/* Based on the content type we can either store or forget the downloaded data
			 * E.g. we do not want to store any images --> Only make a remark that specified URL
			 * returns image data instead of html
			 */
			const contentType = response.headers['content-type'];

			let body;

			if (statusCode != 200){
				console.error("Request faile.\n" +
					`Status Code: ${statusCode}`);
				response.consume();
				return;
			}
			else if (!/\btext\/[jsonxhtml\+]{4,}\b/.test(contentType)) {
				/* For now we only store the textual html or json representation of the page.
				 * Later on we could extend this to other mime types or even simulating a full client.
				 * This could be done to circumvent any countermeasures from the website itself.
				 * Further, we then could also see the effects of potential scripts, using a screenshot
				 * we then could analyse the content with an image classifier, compare (Fidalgo et al. 2017)
				 */
				console.warn("Unsupported MIME Type. \n"+
					`Only accept html and json, but received ${contentType}`);
				// Todo: Add code here which inserts the dummy string (such as "Unsupported MIME Type")
				body = "[Unsupported MIME Type]";
			}
			else{
				response.setEncoding('utf8');
				let rawData = '';
				response.on('data', (chunk) => {
					rawData += chunk;
				});
				response.on('end', () =>{
					// callback to async extraction methods
					try{
						console.log(rawData);
						body = rawData;
					}
					catch(e) {
						console.error(e.message);
					}
				});
			}
			
		}

		http.get(request, onresponse).on('error', (err) => {
			console.log("http request for url [" + url + "] failed with error\n" + err.message);
		});
	}

	set tor(tor_agent){
		this._tor_agent = tor_agent;
	}

	start_spidering(){
		var new_found_urls = new Set();
		var iteratable_url_array = Array.from(this._start_urls);
		for(let index in iteratable_url_array){
			console.log("URL: " + iteratable_url_array[index]);
			this.scrape(iteratable_url_array[index]).catch(function(error) {
				console.warn("An error occured while scraping the website with URL " + iteratable_url_array[index] +".\n\
					This was caused by " + error.message);
			});
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
	console.log('Test set operations')
	var a = new Set([1,2,3,4]);
	var b = new Set([4,6,7,8]);
	console.log('a: ' + a.toString());
	console.log('b: ' + b.toString());
	var union = b.union(a);
	console.log('union: ' + union.toString());
	var difference = union.difference(b);
	console.log('difference: ' + difference.toString());
	rl.question("Give a starting point for our darknet spider (a .onion address):\n", function(url) {
		console.log("Start url: " + url);
		spider = new Spider([url], 1 /* depth */);

		const run = async function(){
			const tor = await nightlink.launch({
				SocksPort: _port
			});

			console.log("Tor up and running");

			tor.on('log', console.log);
			tor.on('notice', console.log);
			tor.on('warn', console.warn);
			tor.on('err', console.error);

			spider.tor = tor;
			spider.start_spidering();
		}

		run()
	});
};

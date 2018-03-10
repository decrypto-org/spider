require('./extensions/Set');

const readline = require('readline');
const http = require('http');
const rl = readline.createInterface(process.stdin, process.stdout, null);

const request = require('request');
const cheerio = require('cheerio');
const nightlink = require('nightlink');
const ProxyAgent = require('proxy-agent');


var Spider = class Spider{
	constructor(tor_port, start_urls, depth, db){
		// Please note: only start the spider, when the tor agent is set
		console.log("start_url: " + start_urls);
		this._start_urls = new Set(start_urls);
		console.log("this._start_urls: " + this._start_urls);
		this._visited_urls = new Set();
		this._init_depth = depth;
		this._tor_port = tor_port;
		this._tor_agent = null;
		this._db = db;
		const run = async () => {
			const tor = await nightlink.launch({
				SocksPort: tor_port
			});

			console.log("Tor up and running");

			tor.on('log', console.log);
			tor.on('notice', console.log);
			tor.on('warn', console.warn);
			tor.on('err', console.error);

			self._tor_agent = tor;
			self.start_spidering();
		};

		run();
	}

	async extract_and_store_data(current_url, current_path, body){
		// Load data to cheerio/jquery interface
		const $ = cheerio.load(body);
		$('a').each((i, elem) =>{
			console.log("currently looking at element: " + elem);
		});
	}

	async scrape(url, path){
		console.log("[spider.scrape] == Params: url=" + url);
		// stores a tuple of url, content and list of found urls (content for later classification) in the database
		var proxyUri = 'socks://127.0.0.1:' + this._tor_port;

		var request = {
			method: 'GET',
			host: url,
			path: path,
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
				console.error("[spider.scrape.onresponse] Request faile.\n" +
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
				this._db.insert_response(
					url,
					path,
					body,
					true /* success_flag */,
					false /* contains_data */
				);
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
						this._db.insert_response(url, path, body);
						this.extract_and_store_data(url, path, body);
					}
					catch(e) {
						console.error("[spider.scrape.onresponse] " + e.message);
					}
				});
			}
		}

		http.get(request, onresponse).on('error', (err) => {
			console.log("http request for url [" + url + "] failed with error \"" + err.message + "\"");
			this._db.insert_response(
				url,
				path,
				'Error: http request failed',
				false /* success_flag */
			);
		});
	}

	start_spidering(){
		// Check DB every x seconds if new (not yet scraped entries or entries that should be rescraped) are available
		var iteratable_url_array = Array.from(this._start_urls);
		for(let index in iteratable_url_array){
			console.log("URL: " + iteratable_url_array[index]);
			this.scrape(iteratable_url_array[index], "/").catch(function(error) {
				console.warn("An error occured while scraping the website with URL " + iteratable_url_array[index] +".\n\
					This was caused by " + error.message);
			});
		}
	}
};

exports.Spider = Spider;

// exports.start_spider = function(){
// 	var spider;
// 	console.log('Test set operations')
// 	var a = new Set([1,2,3,4]);
// 	var b = new Set([4,6,7,8]);
// 	console.log('a: ' + a.toString());
// 	console.log('b: ' + b.toString());
// 	var union = b.union(a);
// 	console.log('union: ' + union.toString());
// 	var difference = union.difference(b);
// 	console.log('difference: ' + difference.toString());
	
// };

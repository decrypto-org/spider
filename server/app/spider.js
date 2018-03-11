var { logger } = require("./library/logger");
require("./extensions/Set");

const http = require("http");
const cheerio = require("cheerio");
const nightlink = require("nightlink");
const ProxyAgent = require("proxy-agent");


var Spider = class Spider{
	constructor(tor_port, start_urls, depth, db){
		// Please note: only start the spider, when the tor agent is set
		logger.info("start_url: " + start_urls);
		this._start_urls = new Set(start_urls);
		logger.info("this._start_urls: " + this._start_urls);
		this._visited_urls = new Set();
		this._init_depth = depth;
		this._tor_port = tor_port;
		this._tor_agent = null;
		this._db = db;
		const run = async () => {
			const tor = await nightlink.launch({
				SocksPort: tor_port
			});

			logger.info("Tor up and running");

			tor.on("log", logger.info);
			tor.on("notice", logger.info);
			tor.on("warn", logger.warn);
			tor.on("err", logger.error);

			this._tor_agent = tor;
			this.start_spidering();
		};

		run();
	}

	async extract_and_store_data(current_url, current_path, body){
		// Load data to cheerio/jquery interface
		const $ = cheerio.load(body);
		$("a").each((i, elem) =>{
			logger.info("currently looking at element: ", elem);
		});
	}

	async scrape(url, path){
		logger.info("[spider.scrape] == Params: url=" + url);
		// stores a tuple of url, content and list of found urls (content for later classification) in the database
		var proxyUri = "socks://127.0.0.1:" + this._tor_port;

		var request = {
			method: "GET",
			host: url,
			path: path,
			agent: new ProxyAgent(proxyUri)
		};

		const onresponse = async (response) => {  // replace code below with a callback function
			logger.info(response.statusCode, response.headers);

			const { statusCode } = response;
			/* Based on the content type we can either store or forget the downloaded data
			 * E.g. we do not want to store any images --> Only make a remark that specified URL
			 * returns image data instead of html
			 */
			const contentType = response.headers["content-type"];

			let body;

			if (statusCode != 200){
				logger.error("[spider.scrape.onresponse] Request faile.\n" +
					`Status Code: ${statusCode}`);
				response.consume();
				return;
			}
			else if (!/\btext\/[jsonxhtml+]{4,}\b/.test(contentType)) {
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
				response.setEncoding("utf8");
				let rawData = "";
				response.on("data", (chunk) => {
					rawData += chunk;
				});
				response.on("end", () =>{
					// callback to async extraction methods
					try{
						logger.info(rawData);
						body = rawData;
						this._db.insert_response(url, path, body);
						this.extract_and_store_data(url, path, body);
					}
					catch(e) {
						logger.error("[spider.scrape.onresponse] " + e.message);
					}
				});
			}
		};

		http.get(request, onresponse).on("error", (err) => {
			logger.info("http request for url [" + url + "] failed with error \"" + err.message + "\"");
			this._db.insert_response(
				url,
				path,
				"Error: http request failed",
				false /* success_flag */
			);
		});
	}

	start_spidering(){
		// Check DB every x seconds if new (not yet scraped entries or entries that should be rescraped) are available
		var iteratable_url_array = Array.from(this._start_urls);
		for(let index in iteratable_url_array){
			logger.info("URL: " + iteratable_url_array[index]);
			this.scrape(iteratable_url_array[index], "/").catch(function(error) {
				console.warn("An error occured while scraping the website with URL " + iteratable_url_array[index] +".\n\
					This was caused by " + error.message);
			});
		}
	}
};

exports.Spider = Spider;

let {logger} = require("./library/logger");
require("./extensions/Set");

const http = require("http");
const cheerio = require("cheerio");
const nightlink = require("nightlink");
const ProxyAgent = require("proxy-agent");


let Spider = class Spider {
    /**
     * Initializes the spider and starts spidering right away.
     * @constructor
     * @param {int} torPort - The port used to connect to the tor network
     * @param {string[]} startUrls - Bootstrap list of urls to start the spider
     * @param {int} depth - Cutoff value for scraping the network. After
     *                       this number of rounds, we stop the spider.
     * @param {DB} db - The DB object used to access the db backend.
     */
    constructor(torPort, startUrls, depth, db) {
        // Please note: only start the spider, when the tor agent is set
        logger.info("start_url: " + startUrls);
        this._startUrls = new Set(startUrls);
        logger.info("this._startUrls: " + this._startUrls);
        this._visitedUrls = new Set();
        this._initDepth = depth;
        this._torPort = torPort;
        this._torAgent = null;
        this._db = db;
        const run = async () => {
            const tor = await nightlink.launch({
                SocksPort: torPort,
            });

            logger.info("Tor up and running");

            tor.on("log", logger.info);
            tor.on("notice", logger.info);
            tor.on("warn", logger.warn);
            tor.on("err", logger.error);

            this._torAgent = tor;
            this.startSpidering();
        };

        run();
    }

    /**
     * Extracts links from the fetched document and stores it in the DB
     * @param {string} currentUrl - The url of the fetched document.
     * @param {string} currentPath - The path of the fetched document.
     * @param {html|json} body - The documents content.
     */
    async extractAndStoreData(currentUrl, currentPath, body) {
        // Load data to cheerio/jquery interface
        const $ = cheerio.load(body);
        $("a").each((i, elem) =>{
            logger.info("currently looking at element: ", elem);
        });
    }

    /**
     * Downloads the document and checks for MIME Type
     * @param {string} url - This is the hosts url.
     * @param {string} path - This is the path which should be downloaded.
     */
    async scrape(url, path) {
        logger.info("[spider.scrape] == Params: url=" + url);
        // stores a tuple of url, content and list of found urls
        // (content for later classification) in the database
        let proxyUri = "socks://127.0.0.1:" + this._torPort;

        let request = {
            method: "GET",
            host: url,
            path: path,
            agent: new ProxyAgent(proxyUri),
        };

        // TODO: replace code below with a callback function
        const onresponse = async (response) => {
            logger.info(response.statusCode, response.headers);

            const {statusCode} = response;
            /* Based on the content type we can either store or forget the
             * downloaded data. E.g. we do not want to store any images, so we
             * only make a remark that specified URL returns image data
             * instead of html
             */
            const contentType = response.headers["content-type"];

            let body;

            if (statusCode != 200) {
                logger.error("[spider.scrape.onresponse] Request faile.\n" +
                    `Status Code: ${statusCode}`);
                response.consume();
                return;
            } else if (!/\btext\/[jsonxhtml+]{4,}\b/.test(contentType)) {
                /* For now we only store the textual html or json representation
                 * of the page. Later on we could extend this to other mime
                 * types or even simulating a full client. This could be done
                 * to circumvent any countermeasures from the website itself.
                 * Further, we then could also see the effects of potential
                 * scripts, using a screenshot we then could analyse the content
                 * with an image classifier, compare (Fidalgo et al. 2017)
                 */
                console.warn("Unsupported MIME Type. \n"+
                    `Only accept html and json, but received ${contentType}`);
                body = "[Unsupported MIME Type]";
                this._db.insert_response(
                    url,
                    path,
                    body,
                    true /* success_flag */,
                    false /* contains_data */
                );
            } else {
                response.setEncoding("utf8");
                let rawData = "";
                response.on("data", (chunk) => {
                    rawData += chunk;
                });
                response.on("end", () =>{
                    // callback to async extraction methods
                    try {
                        logger.info(rawData);
                        body = rawData;
                        this._db.insert_response(url, path, body);
                        this.extractAndStoreData(url, path, body);
                    } catch (e) {
                        logger.error("[spider.scrape.onresponse] " + e.message);
                    }
                });
            }
        };

        http.get(request, onresponse).on("error", (err) => {
            logger.info(
                "http request for url [" + url + "] failed with error \n" +
                err.message + "\""
            );
            this._db.insert_response(
                url,
                path,
                "Error: http request failed",
                false /* success_flag */
            );
        });
    }

    /** Starts the spider */
    startSpidering() {
        let iteratableUrlArray = Array.from(this._startUrls);
        for (let i = 0; i<iteratableUrlArray.length; i++) {
            logger.info("URL: " + iteratableUrlArray[i]);
            this.scrape(iteratableUrlArray[i], "/").catch(function(err) {
                logger.warn(
                    "An error occured while scraping the website with URL\n" +
                    iteratableUrlArray[i] +".\nThis was caused by " +
                    err.message);
            });
        }
    }
};

exports.Spider = Spider;

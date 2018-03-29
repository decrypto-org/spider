let {logger} = require("./library/logger");
let NetworkLib = require("./library/promiseNetworkLib");

const nightlink = require("nightlink");
const ProxyAgent = require("proxy-agent");
let EventEmitter = require("events");


/**
 * This module handels all the requests to the tor network.
 * It ensures, that we do not have too many parallel requests open
 * as this might be detected as a DoS attack by a target.
 * It provides functionality to download data and further initially
 * process that data, such that it can be used for extracting and
 * storing information.
 */
class Network extends EventEmitter {
    /**
     * Initialize the downloader class
     * @constructor
     * @param {object} torAgent -- Object that handles the connection through
     *                             the TOR network.
     * @param {number} torPort -- The proxy port for the tor network.
     */
    constructor(torAgent, torPort) {
        super();
        logger.info("Initialize Network");
        this.torPort = torPort;
        this.proxyUri = "socks://127.0.0.1:" + this.torPort;
        this.torAgent = torAgent;
        this.torAgent.on("log", logger.info);
        this.torAgent.on("notice", logger.info);
        this.torAgent.on("warn", logger.warn);
        this.torAgent.on("err", logger.error);
        this.availableSlots = Network.MAX_SLOTS;
        logger.info("Network initialized");
    }
   
    /**
     * This event is thrown everytime a slot is freed
     */
    static get NETWORK_READY() {
        return "networkReady";
    }

    /**
     * Indicate the maximal number of slots available
     */
    static get MAX_SLOTS() {
        return 2;
    }

    /**
     * This RegEx can be used to match or test strings if they contain base64
     * encoded data. Credits to @bgrins (GitHub)
     * Direct Link: https://gist.github.com/bgrins/6194623
     * @param {string} stringToTest - This string will be tested against the
     *                                regex.
     * @return {boolean} The return value indicates whether the passed string
     *                   contained any base64 data (true) or not (false).
     */
    static matchBase64(stringToTest) {
        // Todo: Whitelist text (css, html)
        // Todo: Possibly move to Parser
        /* eslint-disable max-len,no-useless-escape */
        return /\s*data:([a-z]+\/[a-z]+(;[a-z\-]+\=[a-z\-]+)?)?(;base64)?,[a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*/.test(stringToTest);
        /* eslint-enable max-len,no-useless-escape */
    }

    /**
     * Build a new network object.
     * @constructor
     * @param {number} torPort - The proxy port for the tor network.
     * @return {object} An initialized instance of the network.
     */
    static async build(torPort) {
        logger.info("Starting Tor on port " + torPort);
        const tor = await nightlink.launch({
            SocksPort: torPort,
        });
        logger.info("Tor up and running!");
        let networkInstance = new Network(tor, torPort);
        return networkInstance;
    }

    /**
     * Start emitting network ready events to indicate that slots are available.
     * This has to be only called once per network instance.
     */
    startNetwork() {
        this.emitNetworkReady();
    }

    /**
     * Emits a network ready event. This indicates to the user, that the network
     * library is ready to take the next task.
     */
    emitNetworkReady() {
        for (let i = 0; i<this.availableSlots; this.availableSlots--) {
            this.emit(this.constructor.NETWORK_READY);
        }
    }

    /**
     * Free up the specified number of slots. The client is responsible to
     * ensure that those slots are not actually in use.
     * @param {boolean} noNewData=false - If this flag is set, the network wont
     *                                    issue a NetworkReady event, since it
     *                                    has no new data to operate on. This is
     *                                    helpful to detect the end of the
     *                                    scraping process.
     */
    freeUpSlot(noNewData=false) {
        if (this.availableSlots + 1 > this.constructor.MAX_SLOTS) {
            throw new Error("Cannot free up non-existent slots");
        }
        this.availableSlots += 1;
        if (this.availableSlots >= this.constructor.MAX_SLOTS && noNewData) {
            // In this case every DB handler did not get new data to scrape
            // we are therefor finished and can terminate
            logger.info("We've completed our scrape. Bye!");
            process.exit(0);
        }
        if (!noNewData) {
            this.emitNetworkReady();
        }
    }

    /**
     * @typedef NetworkHandlerResponse - Only contains valid responses
     * @type {object}
     * @property {!string} url - The url of the returned request.
     * @property {!string} path - Th path of the returned request.
     * @property {?string} body - The body of a response.
     * @property {!number} statusCode - The HTTP status code of a response.
     * @property {?string} mimeType - The MIME Type of a response.
     * @property {!number} timestamp - The timestamp when the response finished.
     */

    /**
     * Make a get request to the specified host and path
     *
     * Eventual url parameters are currently contained within the path
     * @param {string} url - This is the hosts url
     * @param {string} path - This is the path to the document
     * @param {boolean} secure - Indicate whether to use http or https
     * @return {NetworkHandlerResponse} Contains all information needed from the
     *                                  response @type{NetworkHandlerResponse}.
     */
    async get(url, path, secure) {
        logger.info("[GET] " + url + path);
        // For more information about uclibc bug, please refer to
        // https://github.com/nodejs/node/issues/5436
        // Here the fix, but not available on all systems:
        // http://cgit.uclibc-ng.org/cgi/cgit/uclibc-ng.git/commit/?
        // id=3c1457161e5206c2d576ab25d350a139511c096d
        let request = {
            method: "GET",
            hostname: url,
            path: path,
            agent: new ProxyAgent(this.proxyUri),
        };
        let response = await new NetworkLib(request)
        .get(secure).catch((error) => {
            logger.error(
                "HTTP GET request for url [" + url + "] failed with error\n\"" +
                error.message + "\""
            );
            logger.error(error.stack);
            return {
                "statusCode": 400,
                "headers": {
                    "content-type": null,
                },
            };
        });
        /** @type {NetworkHandlerResponse}  */
        let result = await this.responseHandler(response, url, path);
        return result;
    }

    /**
     * Handle the response of a get request to a unknown resource.
     * @param {object} response - The response object from axios.get
     * @param {string} url - The url to which the request was made.
     * @param {string} path - The path to which the request was made.
     * @return {NetworkHandlerResponse} result - Contains
     *                                           a) The body of the response
     *                                           b) The returned status code
     *                                           c) MIME type of the response
     */
    async responseHandler(response, url, path) {
        logger.info(response.statusCode, response.headers);

        let statusCode = response.statusCode;
        /* Based on the content type we can either store or forget the
         * downloaded data. E.g. we do not want to store any images, so we
         * only make a remark that specified URL returns image data
         * instead of html
         */
        let contentType = response.headers["content-type"];

        /* According to RFC 1341, we are safe using split(";")[0] to extract
         * only the mime type part.
         * Definition: Content-Type := type "/" subtype *[";" parameter]
         * If no ; is contained in the string, it only returns a list with the
         * whole string as only child.
         */
        let result = {
            "url": url,
            "path": path,
            "body": null,
            "statusCode": 200,
            "mimeType": contentType.split(";")[0],
            "timestamp": (new Date).getTime(),
        };

        if (statusCode != 200) {
            logger.error("Request failed.\n"+
                "Status Code: " + statusCode
            );
            response.consume();
            result.statusCode = statusCode;
        } else if (!/\btext\/[jsonxhtml+]{4,}\b/.test(contentType)) {
            /* For now we only store the textual html or json representation
             * of the page. Later on we could extend this to other mime
             * types or even simulating a full client. This could be done
             * to circumvent any countermeasures from the website itself.
             * Further, we then could also see the effects of potential
             * scripts, using a screenshot we then could analyse the content
             * with an image classifier, compare (Fidalgo et al. 2017)
             */
            logger.warn("Unsuported MIME Type. \n" +
                "Only accept html and json, but received " + contentType
            );
        } else {
            response.setEncoding("utf8");
            let rawData = "";
            response.on("data", (chunk) => {
                rawData += chunk;
            });
            return new Promise((resolve, reject) => {
                response.on("end", () => {
                    try {
                        logger.info(rawData);
                        if (this.constructor.matchBase64(rawData)) {
                            result.body = "[ CONTAINED MEDIA DATA]";
                            logger.warn("We discarded data!");
                            logger.warn(
                                "Reason:\n" +
                                "Ensure compliance with any law.\n" +
                                "Therefor we discard any data that contains" +
                                "a) not a text string\n" +
                                "b) any textual representation of media content"
                            );
                        } else {
                            result.body = rawData;
                        }
                        resolve(result);
                    } catch (e) {
                        logger.error(
                            "An error occured whlie reading the data " +
                            e.message
                        );
                        reject(e);
                    }
                });
            });
        }
        return new Promise((resolve, reject) => {
            resolve(result);
        });
    }
}


module.exports = Network;

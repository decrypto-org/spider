let {logger} = require("./library/logger");

const axios = require("axios");
const nightlink = require("nightlink");
const ProxyAgent = require("proxy-agent");

/**
 * This module handels all the requests to the tor network.
 * It ensures, that we do not have too many parallel requests open
 * as this might be detected as a DoS attack by a target.
 * It provides functionality to download data and further initially
 * process that data, such that it can be used for extracting and
 * storing information.
 */
class Network {
    /**
     * Initialize the downloader class
     * @constructor
     * @param {object} torAgent - Object that handles the connection through the
                                  TOR network.
     * @param {number} torPort - The proxy port for the tor network.
     */
    constructor(torAgent, torPort) {
        logger.info("Initialize Network");
        this.torPort = torPort;
        this.proxyUri = "socks://127.0.0.1:" + this.torPort;
        this.torAgent = torAgent;
        this.torAgent.on("log", logger.info);
        this.torAgent.on("notice", logger.info);
        this.torAgent.on("warn", logger.warn);
        this.torAgent.on("err", logger.error);
        logger.info("Network initialized");
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
        return new Network(tor, torPort);
    }

    /**
     * @typedef HandlerResponse
     * @type {object}
     * @property {?string} body - The body of a response.
     * @property {!number} statusCode - The HTTP status code of a response.
     * @property {?string} mimeType - The MiME Type of a response.
     */

    /**
     * Handle the result of the get request.
     *
     * @callback get
     * @param {string} body - If the MIME Type is supported, this contains
     *                        the body of the response. Otherwise it
     *                        contains a dummy string.
     * @param {number} statusCode - HTTP status code of the response.
     * @param {string} mimeType - A string containing the MIME Type.
     */

    /**
     * Make a get request to the specified host and path
     *
     * Eventual url parameters are currently contained within the path
     * @param {string} url - This is the hosts url
     * @param {string} path - This is the path to the document
     * @param {requestCallback} callback - The callback handles the
                                           the response once it returns
     */
    async get(url, path, callback) {
        logger.info("[GET] " + url + "/" + path);
        // See https://github.com/axios/axios for documentation
        let request = {
            method: "get",
            baseURL: url,
            url: path,
            httpAgent: new ProxyAgent(this.proxyUri),
        };
        let response = await axios(request).catch((error) => {
            logger.info(
                "HTTP GET request for url [" + url + "] failed with error\n\"" +
                error.message + "\""
            );
        });
        /** @type {HandlerResponse}  */
        let result = await this.responseHandler(response);
        callback(result.body, result.statusCode, result.mimeType);
    }

    /**
     * Handle the response of a get request to a unknown resource.
     * @param {object} response - The response object from axios.get
     * @return {HandlerResponse} result - Contains
     *                              a) The body of the response
     *                              b) The returned status code
     *                              c) MIME type of the response
     */
    async responseHandler(response) {
        logger.info(response.statusCode, response.headers);

        let result = {
            "body": null,
            "statusCode": 200,
            "mimeType": null,
        };

        let statusCode = response.status;
        /* Based on the content type we can either store or forget the
         * downloaded data. E.g. we do not want to store any images, so we
         * only make a remark that specified URL returns image data
         * instead of html
         */
        let contentType = response.headers["content-type"];

        if (statusCode != 200) {
            logger.error("Request failed.\n"+
                "Status Code: " + statusCode
            );
            response.consume();
            result.statusCode = statusCode;
            return result;
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
            result.mimeType = contentType;
        } else {
            response.setEncoding("utf8");
            let rawData = "";
            response.on("data", (chunk) => {
                rawData += chunk;
            });
            response.on("end", () => {
                try {
                    logger.info(rawData);
                    result.body = rawData;
                } catch (e) {
                    logger.error(
                        "An error occured whlie reading the data " + e.message
                    );
                }
            });
        }
        return result;
    }
}


module.exports = Network;

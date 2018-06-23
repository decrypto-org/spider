let {logger} = require("./library/logger");
let TorController = require("./library/torController");
let Parser = require("./parser");

const ProxyAgent = require("proxy-agent");

/**
 * Indicate the maximal number of slots available
 */
let _maxSlots = parseInt(process.env.NETWORK_MAX_CONNECTIONS, 10);
if (isNaN(_maxSlots)) {
    _maxSlots = 50;
}
module.exports.MAX_SLOTS = _maxSlots;

/**
 * Indicate the minimal size of the pool holding pending download tasks.
 * Can be set by setting the NETWORK_MIN_POOL_SIZE environment variable.
 */
let _minPool = parseInt(process.env.NETWORK_MIN_POOL_SIZE, 10);
// Note: Ordering of the if clause is important here!
if (isNaN(_minPool) || _minPool <= 0) {
    _minPool = 1000; // Fallback value: this way we can make 10 rounds
                    // of requests with the MAX_SLOTS default value
}
module.exports.MIN_POOL_SIZE = _minPool;

/**
 * Indicate the maximal size of the pool holding pending download tasks.
 * Can be set by setting the NETWORK_MAX_POOL_SIZE environment variable.
 */
let _maxPool = parseInt(process.env.NETWORK_MAX_POOL_SIZE, 10);
// Note: Ordering of the if clause is important here!
if (isNaN(_maxPool) || _maxPool <= 0) {
    _maxPool = 2000;
}
module.exports.MAX_POOL_SIZE = _maxPool;

module.exports.buildInstance = async function(socksPort) {
    let torController = await TorController.buildInstance(
        socksPort,
        60000 /* timeout - please adapt according to the needed steps */
    );
    // await torController.createTorPool().catch((err) => {
    //     console.error("Error while creating Tor pool.");
    //     console.error(err.stack);
    //     console.error(err);
    //     // Exit with error - we cannot work without Tor
    //     process.exit(1);
    // });
    // await torController.createTorInstances(
    //     module.exports.MAX_SLOTS /* numOfInstances */
    // ).catch((err) => {
    //     console.error("Error while creating Tor instances.");
    //     console.error(err.stack);
    //     console.error(err);
    //     // Cannot work if no Tor instances are running
    //     process.exit(1);
    // });
    // await torController.createSocksServer(socksPort).catch((err) => {
    //     console.error("Error while initiating socksServer.");
    //     console.error(err.stack);
    //     console.error(err);
    //     // We do try to proceed, since it is very probable, that we hit
    //     // the timeout if the process is already running. Otherwise, we
    //     // will just fail subsequently
    // });
    return new Network(socksPort, torController);
};

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
     * @param {number} socksPort -- The proxy port for the tor network.
     * @param {Object} torController - The torController controls all the tor
     *                                 instances and can be used to instantiate,
     *                                 kill or rotate IPs of instances.
     */
    constructor(socksPort, torController) {
        logger.info("Initialize Network");
        this.socksPort = socksPort;
        this.ttl = 60100; // Max ttl for Tor: 60s + 100 ms for processing
        this.availableSlots = module.exports.MAX_SLOTS;
        this.proxyUri = "socks://" + process.env.TOR_HOST
                        + ":" + this.socksPort;
        // Naming according to the timing information the chrome dev
        // tools provide. This means:
        // * waiting = TTFB, in our case: The request has been sent, but we
        //   wait for a response.
        // * queued = There were already 6 connections to the same host,
        //   therefor the request was placed in a queue to be downloaded
        //   when the previous download has been finished.
        this.waitingRequestPerHost = {};
        this.queuedRequestsByHost = {};
        this.maxSimultaneousRequestsPerHost = 4;
        // The pool contains a selection of DbResults to be downloaded.
        this.pool = [];
        this.torController = torController;
        this.parser = new Parser();

        // Those arrays are bound in size by the number of concurrently allowed
        // requests. (e.g. MAX_SLOTS)
        this.waitingForSlot = [];
        this.waitingForData = [];
        logger.info("Network initialized");
    }

    /**
     * Download a single webpage and handle the events around it.
     * @param {DbResult} dbResult - Contains the DB result to be downloaded
     * @return {NetworkHandlerResponse} Return the downloaded and parsed
     *                                  result
     */
    async download(dbResult) {
        let response = {};
        if (this.waitingRequestPerHost[dbResult.baseUrlId] == undefined) {
            this.waitingRequestPerHost[dbResult.baseUrlId] = 0;
        }
        this.waitingRequestPerHost[dbResult.baseUrlId] += 1;
        let subdomain = ((dbResult.subdomain == null) ?
            "" : dbResult.subdomain);
        let url = dbResult.subdomain + dbResult.url;
        if (url.length == 0) {
            console.error("url is empty for " + JSON.stringify(dbResult));
            response = {
                "url": url,
                "path": dbResult.path,
                "body": "",
                "statusCode": 400,
                "mimeType": "[NO CONTENT TYPE PROVIDED]",
                "startTime": 0,
            };
            logger.error("Tried to construct empty url.");
            logger.error("This should never happen - returning early");
            // Note that this has never happened in a real life example.
            // This once happened in a testcase, why we inserted this, since
            // a more resilient structure is always good. We want to keep
            // running as long as possible. Error output however is important
            // to detect errors in the program itself.
        } else {
            response = await this.get(
                url,
                dbResult.path,
                dbResult.secure
            );
        }
        this.waitingRequestPerHost[dbResult.baseUrlId] -= 1;
        if (this.waitingRequestPerHost[dbResult.baseUrlId] == 0) {
            // We need to delete this, otherwise we store in memory
            // all the scraped Hosts -- OOM is an issue here
            delete this.waitingRequestPerHost[dbResult.url];
        }
        this.freeUpSlot();
        return response;
    }

    /**
     * As soon as a entry is available from the pool, one will be returned
     * upon request.
     * @return {Promise} Return a DbResult entry from the pool, as soont as one
     *                   is available.
     */
    async getPoolEntry() {
        logger.debug("Current pool size: " + this.pool.length);
        return new Promise((resolve, reject) => {
            for (let host in this.queuedRequestsByHost) {
                // We cannot yet use this entry, since either more than six
                // requests are pending, the array was not yet initialized or
                // does not contain any entries yet.
                // In that case, check the next entry
                if (
                    (this.waitingRequestPerHost[host]
                    >= this.maxSimultaneousRequestsPerHost ||
                    this.queuedRequestsByHost[host] == undefined) ||
                    this.queuedRequestsByHost[host].length == 0
                ) {
                    continue;
                }
                let queuedRequest = this.queuedRequestsByHost[host].pop();
                if (this.queuedRequestsByHost[host].length == 0) {
                    // Needed, otherwise we store all hosts in memory
                    // after a scrape -- OOM is an issue here
                    delete this.queuedRequestsByHost[host];
                }
                resolve(queuedRequest);
                return;
            }
            if (this.pool.length > 0) {
                resolve(this.pool.shift());
                return;
            }
            let pos = this.waitingForData.push(() => {
                resolve(this.pool.shift());
                return;
            });
            setTimeout(() => {
                this.waitingForData[pos] = null;
                reject("getPoolEntry timed out");
                return;
            }, 4*this.ttl);
            // 4*:
            // spider -> remote host
            // remote host -> spider
            // spider -> db
            // db -> spider
        });
    }

    /**
     * Reserve a slot for a request. This is necessary to ensure a maximal
     * number of parallel requests.
     * @return {Promise} Return nothing, but return only if a slot is available.
     */
    async getSlot() {
        return new Promise((resolve, reject) => {
            // Resolve immediately, if a slot is available
            if (this.availableSlots > 0) {
                this.availableSlots--;
                logger.info("Slot resolved");
                resolve();
                return;
            }
            // Wait, if not
            let pos = this.waitingForSlot.push(() => {
                // At this point we know that a slot is available
                this.availableSlots--;
                logger.info("Slot resolved");
                resolve();
                return;
            });
            setTimeout(() => {
                this.waitingForSlot[pos] = null;
                reject("getSlot timed out");
                return;
            }, 2*this.ttl);
            // 2*
            // spider -> remote host
            // remote host -> spider
        });
    }

    /**
     * Free up a slot and notify the appropriate functions
     */
    freeUpSlot() {
        logger.info("Free up network slot");
        this.availableSlots++;
        let callback = null;
        // If the callback was set to null, the request already timed out and
        // we do not have to handle this, just skip it for now
        while (callback == null && this.waitingForSlot.length > 0) {
            callback = this.waitingForSlot.pop();
        }

        if (callback == null) {
            return;
        }

        callback();
    }

    /**
     * Add new data entries to the pool and notify the appropriate functions
     * @param {Array.<DbResult>} newData - Contains new pool data to be
     *                                     downloaded
     */
    addDataToPool(newData) {
        this.pool.push(...newData);
        logger.debug("Added data to pool. Current size: " + this.pool.length);

        let callback = null;
        let maxNumOfDownloadersToCall = newData.length;
        // We get smaller in any iteration: the waitingForData gets smaller in
        // every iteration, maxNumOfDownloads in some
        while (
            this.waitingForData.length > 0 && maxNumOfDownloadersToCall > 0
        ) {
            callback = this.waitingForData.pop();
            if (callback != null) {
                callback();
                maxNumOfDownloadersToCall -= 1;
            }
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
     * @property {!number} startTime - The timestamp when the response started.
     * @property {!number} endTime - The timestamp when the response ended.
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
        /* eslint-disable max-len */
        let headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 6.1; rv:52.0) Gecko/20100101 Firefox/52.0",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Encoding": "identity",
            "Connection": "keep-alive",
        };
        /* eslint-enable max-len */

        let request = {
            method: "GET",
            hostname: url,
            path: encodeURI(path),
            agent: new ProxyAgent(this.proxyUri),
            headers: headers,
        };
        let startTime = (new Date).getTime();
        let response = await this.getAsync(
            request,
            secure,
            this.ttl
        ).catch(
            (err) => {
                if (!err) {
                    logger.error(
                        "HTTP GET request for url " + url + " failed with\n"
                        + " Unknown Error"
                    );
                    return {
                        "statusCode": 400,
                        "headers": {
                            "content-type": null,
                        },
                    };
                }
                logger.error(
                    "HTTP GET request for url " + url + " failed with err\n\"" +
                    err.toString() + "\""
                );
                logger.error(err.stack);
                return {
                    "statusCode": 400,
                    "headers": {
                        "content-type": null,
                    },
                };
            }
        );
        /** @type {NetworkHandlerResponse}  */
        let result = await this.responseHandler(response, url, path, startTime)
            .catch((err) => {
                logger.error(err.error);
                return err.result;
            });
        return result;
    }

    /**
     * Initiate the request specified by the settings object.
     * @param {object} settingsObj - Settings object according to nodejs docu.
     * @param {boolean} secure - Indicate whether to use http or https.
     * @param {number} ttl Maximum time in ms that a request is allowed to live
     * @return {Promise} Returns a promise object, resolves to a response object
     */
    async getAsync(settingsObj, secure, ttl) {
        logger.silly(
            "getAsync for "
            + JSON.stringify(settingsObj)
        );
        let lib = null;
        if (secure) {
            lib = require("follow-redirects").https;
        } else {
            lib = require("follow-redirects").http;
        }
        return new Promise((resolve, reject) => {
            let request = lib.get(settingsObj, (response) => {
                resolve(response);
                return;
            });
            request.on("error", (err) => {
                reject(err);
                return;
            });
            setTimeout(() => {
                reject(
                    "promiseNetwork request "
                    + settingsObj.hostname
                    + settingsObj.path
                    + " timed out"
                );
                return;
            }, ttl);
        });
    }

    /**
     * Handle the response of a get request to a unknown resource.
     * @param {object} response - The response object from getAsync
     * @param {string} url - The url to which the request was made
     * @param {string} path - The path to which the request was made
     * @param {number} startTime - Timestamp when the request was started
     * @return {NetworkHandlerResponse} result - Contains
     *                                           a) The body of the response
     *                                           b) The returned status code
     *                                           c) MIME type of the response
     */
    async responseHandler(response, url, path, startTime) {
        let statusCode = response.statusCode;
        logger.silly(
            "responseHandler received response for "
            + url
            + path
            + " with status "
            + statusCode
        );
        /* Based on the content type we can either store or forget the
         * downloaded data. E.g. we do not want to store any images, so we
         * only make a remark that specified URL returns image data
         * instead of html
         */
        let contentType = response.headers["content-type"] ||
            response.headers["Content-Type"] ||
            "[ NO CONTENT TYPE HEADER PROVIDED ]";

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
            "startTime": startTime,
        };

        // accept 30x as well as 200x --> Those are not errourness messages
        // and might also contain new URI's to fetch. To adhere to the standard
        // we should also implement an update on 301
        if (statusCode < 200 || statusCode >= 400) {
            logger.error("Request failed.\n"+
                "Status Code: " + statusCode
            );
            try {
                response.consume();
            } catch (e) {
                logger.info("Tried to consume response - already closed");
            }
            result.statusCode = statusCode;
            result["endTime"] = (new Date).getTime();
        } else if (!/\b(?:text|application)\/[vcrpaijsonxhtml+]{3,}\b/i.test(
            contentType
        )) {
            /* For now we only store the textual html or json representation
             * of the page. Later on we could extend this to other mime
             * types or even simulating a full client. This could be done
             * to circumvent any countermeasures from the website itself.
             * Further, we then could also see the effects of potential
             * scripts, using a screenshot we then could analyse the content
             * with an image classifier, compare (Fidalgo et al. 2017)
             */
            logger.warn(url + path);
            logger.warn("Unsuported MIME Type. \n" +
                "Only accept html and json, but received " + contentType
            );

            try {
                response.consume();
            } catch (e) {
                logger.silly("Tried to consume response - already closed");
            }
            result["endTime"] = (new Date).getTime();
        } else {
            response.setEncoding("utf8");
            let rawData = "";
            response.on("data", (chunk) => {
                rawData += chunk;
            });
            return new Promise((resolve, reject) => {
                response.on("end", () => {
                    result["endTime"] = (new Date).getTime();
                    try {
                        let body = this.parser.removeBase64Media(rawData);
                        result.body = body;
                        resolve(result);
                        return;
                    } catch (e) {
                        logger.error(
                            "An error occured whlie reading the data " +
                            e.message
                        );
                        logger.error("Caused by " + url + path);
                        reject(e);
                        return;
                    }
                });
                let ttl = this.ttl;
                setTimeout(function() {
                    result["endTime"] = (new Date).getTime();
                    result.statusCode = 500;
                    reject({
                        "error": "responseHandler response timed out",
                        "result": result,
                    });
                    return;
                }, ttl);
            });
        }
        return new Promise((resolve, reject) => {
            resolve(result);
            return;
        });
    }
}


module.exports.Network = Network;

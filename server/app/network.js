let {logger} = require("./library/logger");
let NetworkLib = require("./library/promiseNetworkLib");
let Parser = require("./parser");

let EventEmitter = require("events");
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
        this.ttl = 255100; // Max ttl for IPv4: 255s + 100 ms for processing
        this.torAgent = torAgent;
        this.torAgent.on("warn", console.warn);
        this.torAgent.on("err", console.error);
        this.availableSlots = Network.MAX_SLOTS;
        // Naming according to the timing information the chrome dev
        // tools provide. This means:
        // * waiting = TTFB, in our case: The request has been sent, but we
        //   wait for a response.
        // * queued = There were already 6 connections to the same host,
        //   therefor the request was placed in a queue to be downloaded
        //   when the previous download has been finished.
        this.waitingRequestsPerHost = {};
        this.queuedRequestsByHost = {};
        // The pool contains a selection of DbResults to be downloaded.
        this.pool = [];
        this.parser = new Parser();
        logger.info("Network initialized");
    }

    /**
     * This event is thrown everytime a slot is freed-up
     */
    static get SLOT_FREED_UP() {
        return "slotFreedUp";
    }

    /**
     * This event is thrown everytime the downloader has finished a request.
     * Is used to notify the client, that new data is available to process
     */
    static get NEW_NETWORK_DATA_AVAILABLE() {
        return "newNetworkDataAvailable";
    }

    /**
     * This event is thrown everytime data is added to the pool (not for every
     * entry added but for every update of the pool)
     */
    static get DATA_ADDED_TO_POOL() {
        return "newDataToDownload";
    }

    /**
     * This event is emitted as long as the pool is below its minimum defined
     * size. This can be used by a client to add new data to the pool.
     * One argument should be passed, indicating how many entries are available
     * to the pool max.
     */
    static get POOL_LOW() {
        return "needNewDataToDownload";
    }

    /**
     * Indicate the maximal number of slots available
     */
    static get MAX_SLOTS() {
        let max = parseInt(process.env.NETWORK_MAX_CONNECTIONS, 10);
        if (isNaN(max)) {
            return 100; // Fallback value
        }
        return max; // Value defined by the env (user)
    }

    /**
     * Indicate the minimal size of the pool holding pending download tasks.
     * Can be set by setting the NETWORK_MIN_POOL_SIZE environment variable.
     */
    static get MIN_POOL_SIZE() {
        let minPool = parseInt(process.env.NETWORK_MIN_POOL_SIZE, 10);
        // Note: Ordering of the if clause is important here!
        if (isNaN(minPool) || minPool <= 0) {
            return 1000; // Fallback value: this way we can make 10 rounds
                          // of requests with the MAX_SLOTS default value
        }
        return minPool;
    }

    /**
     * Indicate the maximal size of the pool holding pending download tasks.
     * Can be set by setting the NETWORK_MAX_POOL_SIZE environment variable.
     */
    static get MAX_POOL_SIZE() {
        let maxPool = parseInt(process.env.NETWORK_MAX_POOL_SIZE, 10);
        // Note: Ordering of the if clause is important here!
        if (isNaN(maxPool) || maxPool <= 0) {
            return 2000;
        }
        return maxPool;
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
     * Downloads everything within the pool and everything that might be added
     * in the future.
     */
    async downloadAll() {
        while (
            this.availableSlots >= 0 ||
            this.pool.length >= 0
        ) {
            let error = false;
            // Notify the client that the pool is running low on entries
            // to download. (Optimization: since we do not need to wait
            // for the download to finish, the pool will be repopulated
            // when this download finished)
            // Notify before in case we are already down to 0 entries
            // in the pool -- otherwise the network module starves.
            if (this.pool.length < this.constructor.MIN_POOL_SIZE) {
                this.emit(
                    this.constructor.POOL_LOW,
                    this.constructor.MAX_POOL_SIZE-this.pool.length
                );
            }
            let dbResult = await this.getPoolEntry().catch((err) => {
                logger.error(err);
                let waitingRequestsCount = 0;
                let hosts = Object.keys(this.waitingRequestsPerHost);
                for (let host in hosts) {
                    if (hosts.hasOwnProperty(host)) {
                        let list = this.waitingRequestsPerHost[host];
                        waitingRequestsCount += list.length;
                    }
                }
                if (
                    this.availableSlots.length == this.constructor.MAX_SLOTS &&
                    this.pool.length == 0 &&
                    waitingRequestsCount == 0
                ) {
                    // No pending requests, no pool data, and all slots are free
                    // We are finished.
                    logger.info("Network detected that we are finished");
                    logger.info("Exiting...");
                    process.exit(0);
                }
                // If we are not finished yet, another error must have occured
                // we will retry later
                // Note that this should only happen from a bug on our side
                error = true;
            });
            if (error) {
                continue;
            }
            await this.getSlot().catch((err) => {
                logger.error(err);
                // Push the dbResult back onto the stack - it should be handled
                // later. We can do this, since an exception in the getting
                // of the slot has nothing to do with the dbResult itself.
                // If this would not hold, we would risk a loop
                this.pool.push(dbResult);
                error = true;
            });
            if (error) {
                continue;
            }
            // Do not wait for the download to finish.
            // This method should be used as a downloader pool and therefor
            // start several downloads simultaneously
            this.download(dbResult).catch((err) => {
                logger.error(err);
                // SHould not push back to pool here, since it may be the reason
                // for the errourness execution.
                // this.pool.push(dbResult);
                logger.warn("Discarding " + JSON.stringify(dbResult));
                // Note: Cleanup code should detect this entry as being stale
                // and reset its state - Not the job of the network module
                error = true;
            });
        }
    }

    /**
     * Download a single webpage and handle the events around it.
     * @param {DbResult} dbResult - Contains the DB result to be downloaded
     */
    async download(dbResult) {
        let response = await this.get(
            dbResult.url,
            dbResult.path,
            dbResult.secure
        );
        this.emit(
            this.constructor.NEW_NETWORK_DATA_AVAILABLE,
            response,
            dbResult
        );
        this.freeUpSlot();
    }

    /**
     * As soon as a entry is available from the pool, one will be returned
     * upon request.
     * @return {Promise} Return a DbResult entry from the pool, as soont as one
     *                   is available.
     */
    async getPoolEntry() {
        return new Promise((resolve, reject) => {
            if (this.pool.length > 0) {
                resolve(this.pool.pop());
                return;
            }
            this.once(this.constructor.DATA_ADDED_TO_POOL, () => {
                resolve(this.pool.pop());
                return;
            });
            setTimeout(() => {
                reject("getPoolEntry timed out");
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
                resolve();
                return;
            }
            // Wait, if not
            this.once(this.constructor.SLOT_FREED_UP, () => {
                this.availableSlots--;
                resolve();
                return;
            });
            setTimeout(() => {
                reject("getSlot timed out");
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
        this.availableSlots++;
        this.emit(this.constructor.SLOT_FREED_UP);
    }

    /**
     * Add new data entries to the pool and notify the appropriate functions
     * @param {DbResult[]} newData - Contains new pool data to be downloaded
     */
    addDataToPool(newData) {
        this.pool.push(...newData);
        this.emit(this.constructor.DATA_ADDED_TO_POOL);
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
            path: path,
            agent: new ProxyAgent(this.proxyUri),
            headers: headers,
        };
        let startTime = (new Date).getTime();
        let response = await new NetworkLib(request).get(secure).catch(
            (err) => {
                logger.error(
                    "HTTP GET request for url " + url + " failed with err\n\"" +
                    err.message + "\""
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
        let result = await this.responseHandler(response, url, path, startTime);
        return result;
    }

    /**
     * Handle the response of a get request to a unknown resource.
     * @param {object} response - The response object from axios.get
     * @param {string} url - The url to which the request was made
     * @param {string} path - The path to which the request was made
     * @param {number} startTime - Timestamp when the request was started
     * @return {NetworkHandlerResponse} result - Contains
     *                                           a) The body of the response
     *                                           b) The returned status code
     *                                           c) MIME type of the response
     */
    async responseHandler(response, url, path, startTime) {
        logger.info(response.statusCode, response.headers);

        let statusCode = response.statusCode;
        /* Based on the content type we can either store or forget the
         * downloaded data. E.g. we do not want to store any images, so we
         * only make a remark that specified URL returns image data
         * instead of html
         */
        let contentType = response.headers["content-type"] ||
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

        if (statusCode != 200) {
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
        } else if (!/\btext\/[jsonxhtml+]{4,}\b/i.test(contentType)) {
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

            try {
                response.consume();
            } catch (e) {
                logger.info("Tried to consume response - already closed");
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
                        if (this.parser.matchBase64Media(rawData)) {
                            result.body = "[ CONTAINED MEDIA DATA]";
                            logger.warn("We discarded data!");
                            logger.warn(
                                "Reason:\n" +
                                "Ensure compliance with any laws.\n" +
                                "Therefor we discard any data that contains" +
                                "a) not a text string\n" +
                                "b) any textual representation of media content"
                            );
                            logger.warn("Caused by " + url + path);
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

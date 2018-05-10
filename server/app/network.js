let {logger} = require("./library/logger");
let TorController = require("./library/torController");
let Parser = require("./parser");
let db = require("./models");

let EventEmitter = require("events");
const ProxyAgent = require("proxy-agent");

/**
 * This event is thrown everytime a slot is freed-up
 */
module.exports.SLOT_FREED_UP = "slotFreedUp";

/**
 * This event is thrown everytime the downloader has finished a request.
 * Is used to notify the client, that new data is available to process
 */
module.exports.NEW_NETWORK_DATA_AVAILABLE = "newNetworkDataAvailable";

/**
 * This event is thrown everytime data is added to the pool (not for every
 * entry added but for every update of the pool)
 */
module.exports.DATA_ADDED_TO_POOL = "newDataToDownload";

/**
 * This event is emitted as long as the pool is below its minimum defined
 * size. This can be used by a client to add new data to the pool.
 * One argument should be passed, indicating how many entries are available
 * to the pool max.
 */
module.exports.POOL_LOW = "needNewDataToDownload";

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
class Network extends EventEmitter {
    /**
     * Initialize the downloader class
     * @constructor
     * @param {number} socksPort -- The proxy port for the tor network.
     * @param {Object} torController - The torController controls all the tor
     *                                 instances and can be used to instantiate,
     *                                 kill or rotate IPs of instances.
     */
    constructor(socksPort, torController) {
        super();
        logger.info("Initialize Network");
        this.socksPort = socksPort;
        this.ttl = 60100; // Max ttl for Tor: 60s + 100 ms for processing
        this.availableSlots = module.exports.MAX_SLOTS;
        this.proxyUri = "socks://127.0.0.1:" + this.socksPort;
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
        this.setMaxListeners(module.exports.MAX_SLOTS);
        logger.info("Network initialized");
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
            if (this.pool.length < module.exports.MIN_POOL_SIZE) {
                this.emit(
                    module.exports.POOL_LOW,
                    module.exports.MAX_POOL_SIZE-this.pool.length
                );
            }
            let dbResult = await this.getPoolEntry().catch((err) => {
                logger.error(err);
                let waitingRequestCount = 0;
                let hosts = Object.keys(this.waitingRequestPerHost);
                for (let host in hosts) {
                    if (hosts.hasOwnProperty(host)) {
                        waitingRequestCount += this.waitingRequestPerHost[host];
                    }
                }
                if (
                    this.availableSlots == module.exports.MAX_SLOTS &&
                    this.pool.length == 0 &&
                    waitingRequestCount == 0
                ) {
                    // No pending requests, no pool data, and all slots are free
                    // We are finished.
                    logger.info("Network detected that we are finished");
                    logger.info("Exiting...");
                    // Clean up after ourselves
                    this.torController.closeTorInstances().then(
                        process.exit(0)
                    );
                }
                // If we are not finished yet, another error must have occured
                // we will retry later
                // Note that this should only happen from a bug on our side
                error = true;
            });
            // if an error occured we will just continue with the next entry
            // eventually we'll find one that is working
            if (error) {
                continue;
            }

            // If there are already 6 or more connections to this host, we will
            // stall the execution of this one and add it to the queue.
            // Note that this is a simple JSON object and no ordering is
            // guaranteed. Further: We do never wait on something, so the code
            // below should be executed "atomically". Please note: Do not add
            // any code here, that contains async call
            if (
                this.waitingRequestPerHost[dbResult.baseUrlId] != undefined &&
                this.waitingRequestPerHost[dbResult.baseUrlId]
                >= this.maxSimultaneousRequestsPerHost
            ) {
                let queue = this.queuedRequestsByHost[dbResult.baseUrlId];
                if (!queue) {
                    queue = [];
                }
                queue.push(dbResult);
                this.queuedRequestsByHost[dbResult.baseUrlId] = queue;
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
        if (this.waitingRequestPerHost[dbResult.baseUrlId] == undefined) {
            this.waitingRequestPerHost[dbResult.baseUrlId] = 0;
        }
        this.waitingRequestPerHost[dbResult.baseUrlId] += 1;
        let response = await this.get(
            dbResult.url,
            dbResult.path,
            dbResult.secure
        );
        this.waitingRequestPerHost[dbResult.baseUrlId] -= 1;
        if (this.waitingRequestPerHost[dbResult.baseUrlId] == 0) {
            // We need to delete this, otherwise we store in memory
            // all the scraped Hosts -- OOM is an issue here
            delete this.waitingRequestPerHost[dbResult.url];
        }
        this.emit(
            module.exports.NEW_NETWORK_DATA_AVAILABLE,
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
                resolve(this.pool.pop());
                return;
            }
            this.once(module.exports.DATA_ADDED_TO_POOL, () => {
                resolve(this.pool.pop());
                return;
            });
            setTimeout(() => {
                logger.warn("getPoolEntry timed out");
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
            this.once(module.exports.SLOT_FREED_UP, () => {
                this.availableSlots--;
                resolve();
                return;
            });
            setTimeout(() => {
                logger.warn("getSlot timed out!");
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
        this.emit(module.exports.SLOT_FREED_UP);
    }

    /**
     * Add new data entries to the pool and notify the appropriate functions
     * @param {DbResult[]} newData - Contains new pool data to be downloaded
     */
    addDataToPool(newData) {
        this.pool.push(...newData);
        logger.debug("Added data to pool. Current size: " + this.pool.length);
        this.emit(module.exports.DATA_ADDED_TO_POOL);
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
            lib = require("https");
        } else {
            lib = require("http");
        }
        return new Promise((resolve, reject) => {
            let request = lib.get(settingsObj, (response) => {
                resolve(response);
            });
            request.on("error", (err) => {
                reject(err);
            });
            setTimeout(()=>{
                logger.warn(
                    "getAsync timed out for "
                    + JSON.stringify(settingsObj)
                );
                reject(
                    "promiseNetwork request "
                    + settingsObj.hostname
                    + settingsObj.path
                    + " timed out"
                );
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
        } else if (!/\btext\/[jsonxhtml+]{4,}\b/i.test(contentType)) {
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
                        logger.error("Caused by " + url + path);
                        reject(e);
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
                }, ttl);
            });
        }
        return new Promise((resolve, reject) => {
            resolve(result);
        });
    }
}


module.exports.Network = Network;

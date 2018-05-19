let Parser = require("./parser");
let Network = require("./network");
let {logger} = require("./library/logger");
let db = require("./models");

let EventEmitter = require("events");

/**
 * The conductor is the one controlling the spidering
 * through the web. Therefor it needs to access the network
 * module and the models/database.
 */
class Conductor extends EventEmitter {
    /**
     * Initialize the conductor and start the scrape
     * @constructor
     * @param {number} cutOffDepth - Cutoff value for the number of hops we
     *                               should take, starting from either the
     *                               database or the startUrls.
     * @param {number} torPort=9050 - Port to use for Tor controller server.
     */
    constructor(cutOffDepth, torPort) {
        super();
        // Startup message
        logger.info("Conductor now takes over control");

        this.cutOffDepth = cutOffDepth;

        this.torPort = torPort || 9050;

        this.DB_READY = "dbReadyEvent";

        // Parser init
        this.parser = new Parser();

        this.queuedDbRequests = [];

        // Initialization of later used variables
        this.offsetForDbRequest = 0;
        this.limitForDbRequest = Network.MAX_SLOTS;
        this.setMaxListeners(Network.MAX_SLOTS);
        // Used to only get new data once per undershoot (but multiple times
        // for multiple network pool undershoots)
        this.gettingNewDataFromDb = false;
    }

    /**
     * Initialize the tor client and the db, then start the spidering
     * @param {string[]} startUrls - List of init URL, which serve as
     *                               startpoint for the scraper
     * @param {boolean} attach - True if we attach to a database on which
     *                           already a spider is running. If this is the
     *                           case we do not want to reset inProgress flags,
     *                           since this might leads to undesired behaviour
     *                           (Two spider downloading the same page)
     */
    async run(startUrls, attach) {
        // Synchronize the db model
        await db.sequelize.sync();

        if (!attach) {
            await db.resetStaleEntries(0 /* timeDelta */);
        }

        // Create a network instance
        this.network = await Network.buildInstance(
            this.torPort,
            this /* conductor reference */
        );

        // Now inserting the start urls into the database with scrape
        // timestamp=0, so they will be scraped first (with other, not yet
        // scraped data).
        // Note that we exect a csv. We then check every cell if it contains
        // a .onion url, therefor we use two nested loops.
        let startUrlsNormalized = [];
        for (let lineOfUrls of startUrls) {
            for (let rawUrl of lineOfUrls) {
                let parsedUrl = this.parser.extractOnionURI(
                    rawUrl,
                    "" /* baseUrl */
                );
                startUrlsNormalized.push(...parsedUrl);
            }
        }

        let uriList = [];
        for (let matchedUrl of startUrlsNormalized) {
            let path = matchedUrl.path || "/";
            let baseUrl = matchedUrl.baseUrl.toLowerCase();
            // Note: Without the await, we will get failing commits
            // possibly we overload the database (For large numbers
            // of initial urls)
            // Short term: not an issue, finished in about 5 min
            // Long term solution: Use Bulk inserts
            uriList.push({
                baseUrl: baseUrl,
                subdomain: "",
                path: path,
                depth: 0,
                secure: matchedUrl.secure,
            });
        }

        await db.bulkInsertUri(uriList);

        await this.getEntriesToDownloadPool(
            Network.MAX_POOL_SIZE
        );
        if (this.network.pool.length == 0) {
            logger.info("No data available to scrape.");
            logger.info("Please specify initial data (-i path/to/file.csv)");
            process.exit(0);
        }
        await this.runScraper();

        // Here we are sure that the handler is initialized
        this.network.downloadAll();
    }


    /**
     * Get entries from the DB directly to the network download pool.
     * @param {number} limit - The number of entries to get from the DB
     */
    async getEntriesToDownloadPool(limit) {
        logger.debug("Current pool size: " + this.network.pool.length);
        logger.debug("Getting " + limit + " entries into the pool");
        let excludeKeyObj = Object.filter(
            this.network.waitingRequestPerHost,
            (pending) => pending >= this.network.maxSimultaneousRequestsPerHost
        );
        let [dbResults, moreAvailable] = await db.getEntries({
            dateTime: 0,
            limit: limit,
            cutoffValue: this.cutOffDepth,
            excludedHosts: Object.keys(excludeKeyObj),
        });
        if (dbResults.length == 0 && !moreAvailable) {
            return;
        }
        this.network.addDataToPool(dbResults);
    }

    /**
     * This will only resolve as soon as we have enough capacity to insert
     * into the database again. This should prevent any timeouts on
     * our side.
     * @return {Promise} Resolved as soon as the database is responsive
     */
    async databaseReady() {
        if (this.queuedDbRequests.length < Network.MAX_SLOTS) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            this.once(this.DB_READY, () => {
                resolve();
                return;
            });
            setTimeout(() => {
                // VACUUM takes as much as...
                logger.warn("databaseReady timed out.");
                reject("databaseReady timed out.");
            }, 100000);
        });
    }

    /**
     * Serializes requests to the DB to ensure no overload occures.
     * This helps to add a pushback mechanism for the network
     */
    async insertAllIntoDB() {
        this.insertingEntries = true;
        while (0 < this.queuedDbRequests.length) {
            let currentDbRequest = this.queuedDbRequests.pop();
            let dbResult = currentDbRequest.dbResult;
            let networkResponse = currentDbRequest.networkResponse;
            let urlsList = currentDbRequest.urlsList;
            let successful = networkResponse.statusCode < 400;
            let transaction = null;
            // db.sequelize.transaction(
            //     { autocommit: false }
            // );
            await db.updateUri(
                dbResult.baseUrlId,
                dbResult.pathId,
                networkResponse.startTime,
                networkResponse.endTime,
                dbResult.secure,
                successful,
                transaction
            );
            await db.insertBody(
                dbResult.pathId,
                networkResponse.body || "[MISSING]",
                networkResponse.mimeType || "[MISSING]",
                networkResponse.endTime,
                networkResponse.statusCode,
                transaction
            );
            if (networkResponse.body == null || !successful) {
                continue;
            }
            /** @type {Array.<Link>} Can be directyl bulkCreated */
            let linkList = [];
            /** @type {Array.<URIDefinition>} URIDefinitions for bulkInsert */
            let uriList = [];

            for (let url of urlsList) {
                let path = url.path || "/";
                uriList.push({
                    baseUrl: url.baseUrl,
                    subdomain: url.subdomain,
                    path: path,
                    depth: dbResult.depth + 1,
                    secure: url.secure,
                });
            }

            let pathIds = await db.bulkInsertUri(
                uriList,
                3, 
                transaction
            );

            for (let i = 0; i < pathIds.length; i++) {
                let pathId = pathIds[i];
                linkList.push({
                    sourcePathId: dbResult.pathId,
                    destinationPathId: pathId,
                    timestamp: networkResponse.endTime,
                });
            }

            await db.link.bulkCreate(
                linkList
            );
            // await transaction.commit().then(() => {
            //     logger.info(
            //         "Commited for download "
            //         + networkResponse.url
            //         + networkResponse.path
            //     );
            // });
            if (this.queuedDbRequests.length < Network.MAX_SLOTS){
                this.emit(this.DB_READY);
            }

            // Repopulate network pool (E.g. if this would have been
            // the last request available)
            if (this.network.pool.length < process.env.NETWORK_MIN_POOL_SIZE &&
                !this.gettingNewDataFromDb) {
                let limit = Network.MAX_POOL_SIZE - this.network.pool.length;
                this.gettingNewDataFromDb = true;
                await this.getEntriesToDownloadPool(limit);
                this.gettingNewDataFromDb = false;
            }
        }
        this.emit(this.DB_READY);
        this.insertingEntries = false;
    }

    /**
     * Controls on run of the scraper. This includes storing found urls on the
     * DB and populating the networks pool.
     */
    async runScraper() {
        this.network.on(Network.POOL_LOW, async (size) => {
            if (this.gettingNewDataFromDb) {
                // We are already repopulating the pool - no need to go a second
                // time.
                return;
            }
            this.gettingNewDataFromDb = true;
            await this.getEntriesToDownloadPool(size);
            this.gettingNewDataFromDb = false;
        });
        // Arrow function ensures correct context
        this.network.on(
            Network.NEW_NETWORK_DATA_AVAILABLE, (networkResponse, dbResult) => {
                /** @type{Parser.ParseResult} */
                let urlsList = this.parser.extractOnionURI(
                    networkResponse.body,
                    dbResult
                );
                this.queuedDbRequests.push({
                    networkResponse,
                    dbResult,
                    urlsList,
                });
                logger.info("Added data to db insert pool. Current size: " + this.queuedDbRequests.length)
                if (!this.insertingEntries) {
                    this.insertAllIntoDB();
                }
            }
        );
    }
}
module.exports = Conductor;

let Parser = require("./parser");
let Network = require("./network");
let {logger} = require("./library/logger");
let db = require("./models");

/**
 * The conductor is the one controlling the spidering
 * through the web. Therefor it needs to access the network
 * module and the models/database.
 */
class Conductor {
    /**
     * Initialize the conductor and start the scrape
     * @constructor
     * @param {number} cutOffDepth - Cutoff value for the number of hops we
     *                               should take, starting from either the
     *                               database or the startUrls.
     * @param {number} torPort=9050 - Port to use for Tor controller server.
     */
    constructor(cutOffDepth, torPort) {
        // Startup message
        logger.info("Conductor now takes over control");

        this.cutOffDepth = cutOffDepth;

        this.torPort = torPort || 9050;

        // Parser init
        this.parser = new Parser();

        // Initialization of later used variables
        this.offsetForDbRequest = 0;
        this.limitForDbRequest = Network.MAX_SLOTS;
        // Used to only get new data once per undershoot (but multiple times
        // for multiple network pool undershoots)
        this.gettingNewDataFromDb = false;
    }

    /**
     * Initialize the tor client and the db, then start the spidering
     * @param {string[]} startUrls - List of init URL, which serve as
     *                               startpoint for the scraper
     */
    async run(startUrls) {
        // Synchronize the db model
        await db.sequelize.sync();

        db.resetStaleEntries(0 /* timeDelta */);

        // Create a network instance
        this.network = await Network.buildInstance(
            this.torPort
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
                path: path,
                depth: 0,
                secure: matchedUrl.secure
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
     * If the network finished a download, insert it into the database.
     * @param {NetworkHandlerResponse} networkResponse - The networks response
     *                                                   already serialized
     * @param {DbResult} dbResult - The dbResult for which the download was
     *                              started
     */
    async insertNetworkResponseIntoDb(networkResponse, dbResult) {
        let successful = networkResponse.statusCode == 200;
        // We need to await this before proceeding to prevent getting
        // already scraped entries in the next step
        await db.updateUri(
            dbResult.baseUrlId,
            dbResult.pathId,
            networkResponse.startTime,
            networkResponse.endTime,
            dbResult.secure,
            successful
        );
        await db.insertBody(
            dbResult.pathId,
            networkResponse.body || "[MISSING]",
            networkResponse.mimeType || "[MISSING]",
            networkResponse.endTime,
            networkResponse.statusCode
        );
        // Scrape the links to other pages, then insert them into the db
        // if the download was successful and the MIME Type correct
        if (networkResponse.body == null || !successful) {
            return;
        }

        /** @type{Parser.ParseResult} */
        let urlsList = this.parser.extractOnionURI(
            networkResponse.body,
            dbResult
        );
        /** @type {Array.<Link>} Can be directyl bulkCreated */
        let linkList = [];
        let uriList = [];

        for (let url of urlsList) {
            let path = url.path || "/";
            uriList.push({
                baseUrl: url.baseUrl,
                path: path,
                depth: dbResult.depth + 1,
                secure: url.secure,
            });
        }

        let pathIds = await db.bulkInsertUri(uriList);

        for (let i = 0; i < pathIds.length; i++) {
            let pathId = pathIds[i];
            linkList.push({
                sourcePathId: dbResult.pathId,
                destinationPathId: pathId,
                timestamp: networkResponse.endTime,
            });
        }

        await db.link.bulkCreate(linkList);

        // For the case we hit 0 in the network pool and
        // this was the last request, we need to repopulate
        // the pool here, if any data was added to the database
        if (this.network.pool.length < process.env.NETWORK_MIN_POOL_SIZE &&
            !this.gettingNewDataFromDb) {
            let limit = Network.MAX_POOL_SIZE - this.network.pool.length;
            this.gettingNewDataFromDb = true;
            await this.getEntriesToDownloadPool(limit);
            this.gettingNewDataFromDb = false;
        }
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
                this.insertNetworkResponseIntoDb(networkResponse, dbResult);
            }
        );
    }
}
module.exports = Conductor;

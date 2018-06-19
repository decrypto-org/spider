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
        // Store the maximum number of concurrent connections to the database
        this.availableDbConnections = process.env.DB_MAX_CONNECTIONS || 10;

        this.waitingForDbConnection = [];
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
            this.torPort
        );

        // Now inserting the start urls into the database with scrape
        // timestamp=0, so they will be scraped first (with other, not yet
        // scraped data).
        // Note that we expect a csv. We then check every cell if it contains
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
        ).catch((err) => {
            logger.error(err.message);
            logger.error(err.stack);
            this.gettingNewDataFromDb = false;
        });
        if (this.network.pool.length == 0) {
            logger.info("No data available to scrape.");
            logger.info("Please specify initial data (-i path/to/file.csv)");
            process.exit(0);
        }

        // Here we are sure that the handler is initialized
        this.downloadAll();
    }


    /**
     * Get entries from the DB directly to the network download pool.
     * @param {number} limit - The number of entries to get from the DB
     * @return {Promise} Only used for early returns
     */
    async getEntriesToDownloadPool(limit) {
        logger.info("Get data from DB to network pool");
        if (this.gettingNewDataFromDb) {
            // We are already repopulating the pool - no need to go a second
            // time.
            logger.info("We are still not finished getting new data");
            return Promise.resolve();
        }
        this.gettingNewDataFromDb = true;
        logger.debug("Current pool size: " + this.network.pool.length);
        logger.debug("Getting " + limit + " entries into the pool");
        let excludeKeyObj = Object.filter(
            this.network.waitingRequestPerHost,
            (pending) => pending >= this.network.maxSimultaneousRequestsPerHost
        );
        let dbResults = [];
        let available = false;
        let inverse = false;
        switch (process.env.SCRAPING_STRATEGY) {
            case "new":
                [dbResults, available] = await db.getNeverScrapedEntries(
                    limit,
                    this.cutOffDepth
                );
                break;
            case "prioritized":
                 [dbResults, available] = await db.getEntriesPrioritized(
                    0, /* dateTime */
                    limit - dbResults.length,
                    this.cutOffDepth,
                    Object.keys(excludeKeyObj)
                );
                break;
            case "random":
                [dbResults, available] = await db.getEntriesRandomized({
                    dateTime: 0,
                    limit: limit - dbResults.length,
                    cutoffValue: this.cutOffDepth,
                    excludedHosts: Object.keys(excludeKeyObj),
                });
                break;
            case "combined":
                let [unscrapedDbResults, newAvailable] = await db.getNeverScrapedEntries(
                    limit,
                    this.cutOffDepth
                );
                dbResults = unscrapedDbResults;
                if (unscrapedDbResults.length >= limit) {
                    break;
                }
                let [prioritizedPages, prioAvailable] = await db.getEntriesPrioritized(
                    0, /* dateTime */
                    limit - dbResults.length,
                    this.cutOffDepth,
                    Object.keys(excludeKeyObj)
                );
                dbResults.push(...prioritizedPages);
                if (dbResults.length >= limit) {
                    break;
                }
                let [randomizedDbResults, randAvailable] = await db.getEntriesRandomized({
                    dateTime: 0,
                    limit: limit - dbResults.length,
                    cutoffValue: this.cutOffDepth,
                    excludedHosts: Object.keys(excludeKeyObj),
                });
                dbResults.push(...randomizedDbResults);
                break;
            case "inverse":
                inverse = true;
            case "recursive":
            default:
                [dbResults, available] = await db.getEntriesRecursive(
                    0, /* dateTime */
                    limit,
                    this.cutOffDepth,
                    Object.keys(excludeKeyObj)
                );
                break;
        }
        if (dbResults.length == 0 && !available) {
            logger.info("No new entries from db. Nothing to add to pool");
            this.gettingNewDataFromDb = false;
            return Promise.resolve();
        }
        this.network.addDataToPool(dbResults);
        this.gettingNewDataFromDb = false;
        return Promise.resolve();
    }

    /**
     * Ensures that we are not overloading the db in case of a very fast network
     * this mechanism pushes back, such that we wait before issuing new
     * connections to the network.
     * @return {Promise} Is resolved as soon as a DBConnection is available
     *                   for this download
     */
    async getDbConnection() {
        logger.info("Get DB connection");
        return new Promise((resolve, reject) => {
            if (this.availableDbConnections > 0) {
                this.availableDbConnections -= 1;
                logger.info("Resolve DB connection");
                resolve();
                return;
            }

            this.waitingForDbConnection.push(() => {
                this.availableDbConnections -= 1;
                logger.info("Resolve DB connection");
                resolve();
                return;
            });
            // we do not timeout here, since we already have data that should be
            // inserted. Worst case scenario: We loose connection to the db.
            // In this case we won't be able to make progress, however, we would
            // not be able to do so anyway.
        });
    }

    /**
     * Does return the DB connection to the connection pool and potentially
     * calls any waiting client.
     */
    returnDbConnection() {
        logger.info("Returned DB connection");
        this.availableDbConnections += 1;

        let callback = null;

        while (callback == null && this.waitingForDbConnection.length > 0) {
            callback = this.waitingForDbConnection.pop();
        }

        if (callback != null) {
            callback();
        }
    }

    /**
     * If the network finished a download, insert it into the database.
     * @param {NetworkHandlerResponse} networkResponse - The networks response
     *                                                   already serialized
     * @param {DbResult} dbResult - The dbResult for which the download was
     *                              started
     */
    async insertNetworkResponseIntoDb(networkResponse, dbResult) {
        logger.info("Insert network response into DB");
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
            networkResponse.body || "",
            networkResponse.mimeType || "[MISSING]",
            networkResponse.endTime,
            networkResponse.statusCode
        );
        // Scrape the links to other pages, then insert them into the db
        // if the download was successful and the MIME Type correct
        if (networkResponse.body == null || !successful) {
            if (successful) {
                console.error(
                    "Body is empty for dbResult " + JSON.stringify(dbResult)
                    + "\nnetworkResponse: " + JSON.stringify(networkResponse)
                );
            }
            return;
        }

        let isHtml = networkResponse.mimeType == "text/html"
            || networkResponse.mimeType == "application/xhtml"
            || networkResponse.mimeType == "application/xhtml+xml"
            || networkResponse.mimeType == "text/xhtml";
        /** @type{Parser.ParseResult} */
        let urlsList = this.parser.extractOnionURI(
            networkResponse.body,
            dbResult,
            isHtml
        );

        if (urlsList.length <= 0) {
            return;
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

        // Update distinct link count on paths
        // First get the counts for the just inserted paths/links
        /* eslint-disable no-multi-str */
        let queryString = "\
        SELECT\n\
            COUNT(DISTINCT paths.\"baseUrlBaseUrlId\") as incount,\n\
            \"links\".\"destinationPathId\"\n\
        FROM\n\
            links\n\
            INNER JOIN paths ON paths.\"pathId\" = links.\"sourcePathId\"\n\
        WHERE\n\
            \"links\".\"destinationPathId\" IN (\n\
        ";
        let replacementsForCount = [];
        for (let i = 0; i < pathIds.length; i++) {
            let value = "?";
            replacementsForCount.push(pathIds[i]);
            if (i == pathIds.length -1) {
                value += "\n";
            } else {
                value += ",\n";
            }
            queryString += value;
        }
        queryString += ")\n\
        GROUP BY links.\"destinationPathId\"";
        let incountsByPathId = await db.sequelize.query(
            queryString,
            {replacements: replacementsForCount}
        ).catch((err) => {
            // This error is not that bad, we just log it and continue
            // It might be recalculated in a later step or it would have
            // a low incoming count anyway
            logger.error(err.message);
            logger.error(err.stack);
        });

        incountsByPathId = incountsByPathId[0];
        queryString = "\
        UPDATE paths AS p set\n\
            \"numberOfDistinctHits\" = v.frequency\n\
        FROM (values\n\
        ";
        let replacementsForUpdate = [];
        for (let i = 0; i < incountsByPathId.length; i++) {
            let incount = incountsByPathId[i];
            let value = "(?::uuid, ?::BIGINT)";
            replacementsForUpdate.push(incount.destinationPathId);
            replacementsForUpdate.push(incount.incount);
            if (i == incountsByPathId.length - 1) {
                value += "\n";
            } else {
                value += ",\n";
            }
            queryString += value;
        }
        queryString += ") as v(id, frequency)\n\
        WHERE v.id = p.\"pathId\"";

        await db.sequelize.query(
            queryString,
            {replacements: replacementsForUpdate}
        ).catch((err) => {
            // This error is not that bad, we just log it and continue
            // It might be recalculated in a later step or it would have
            // a low incoming count anyway
            logger.error(err.message);
            logger.error(err.stack);
        });

        // For the case we hit 0 in the network pool and
        // this was the last request, we need to repopulate
        // the pool here, if any data was added to the database
        if (this.network.pool.length < process.env.NETWORK_MIN_POOL_SIZE &&
            !this.gettingNewDataFromDb) {
            let limit = Network.MAX_POOL_SIZE - this.network.pool.length;
            await this.getEntriesToDownloadPool(limit).catch((err) => {
                logger.error(err.message);
                logger.error(err.stack);
                this.gettingNewDataFromDb = false;
            });
        }
    }

    /**
     * Downloads everything within the pool and everything that might be added
     * in the future.
     */
    async downloadAll() {
        while (
            this.network.availableSlots >= 0 ||
            this.network.pool.length >= 0
        ) {
            let error = false;
            let dbResult = await this.network.getPoolEntry().catch((err) => {
                logger.error(err);
                let waitingRequestCount = 0;
                let hosts = Object.keys(this.network.waitingRequestPerHost);
                for (let host in hosts) {
                    if (hosts.hasOwnProperty(host)) {
                        waitingRequestCount +=
                            this.network.waitingRequestPerHost[host];
                    }
                }
                if (
                    this.network.availableSlots == module.exports.MAX_SLOTS &&
                    this.network.pool.length == 0 &&
                    waitingRequestCount == 0
                ) {
                    // No pending requests, no pool data, and all slots are free
                    // We are finished.
                    logger.info("Network detected that we are finished");
                    logger.info("Exiting...");
                    // Clean up after ourselves
                    this.network.torController.closeTorInstances().then(
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

            // If there are already 4 or more connections to this host, we will
            // stall the execution of this one and add it to the queue.
            // Further: We do never wait on something, so the code
            // below should be executed "atomically". Please note: Do not add
            // any code here, that contains async call
            if (
                this.network.waitingRequestPerHost[dbResult.baseUrlId]
                != undefined &&
                this.network.waitingRequestPerHost[dbResult.baseUrlId]
                >= this.network.maxSimultaneousRequestsPerHost
            ) {
                let queue =
                    this.network.queuedRequestsByHost[dbResult.baseUrlId];
                if (!queue) {
                    queue = [];
                }
                queue.push(dbResult);
                this.network.queuedRequestsByHost[dbResult.baseUrlId] = queue;
                continue;
            }
            await this.network.getSlot().catch((err) => {
                logger.error(err);
                // Push the dbResult back onto the stack - it should be handled
                // later. We can do this, since an exception in the getting
                // of the slot has nothing to do with the dbResult itself.
                // If this would not hold, we would risk a loop
                this.network.pool.push(dbResult);
                error = true;
            });
            if (error) {
                continue;
            }
            // Hacky way to work around overloading the database and still
            // make use of as amany concurrent connections as possible.
            // This ensures that we do never download faster than we can write
            // and that we do not bloat the memory. However, it allows for a
            // very slow connection to not slow down the process as long as we
            // have #db connection many fast downloads
            await this.getDbConnection();
            this.returnDbConnection();


            // Do not wait for the download to finish.
            // This method should be used as a downloader pool and therefor
            // start several downloads simultaneously
            let haveDbConnection = false;
            this.network.download(dbResult).then(async (response) => {
                await this.getDbConnection();
                haveDbConnection = true;

                await this.insertNetworkResponseIntoDb(response, dbResult);

                this.returnDbConnection();
            }).catch((err) => {
                if (haveDbConnection) {
                    this.returnDbConnection();
                }

                logger.error(err);
                // SHould not push back to pool here, since it may be the reason
                // for the errourness execution.
                // this.pool.push(dbResult);
                logger.warn("Discarding " + JSON.stringify(dbResult));
                // Note: Cleanup code should detect this entry as being stale
                // and reset its state - Not the job of the network module
                error = true;
                this.network.freeUpSlot();
            });
        }
    }
}
module.exports = Conductor;

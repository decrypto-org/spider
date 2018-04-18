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
     * @param {string[]} startUrls - List of init URL, which serve as
     *                               startpoint for the scraper
     * @param {number} cutOffDepth - Cutoff value for the number of hops we
     *                               should take, starting from either the
     *                               database or the startUrls.
     * @param {number} torPort - Port to use for Tor proxy.
     */
    constructor(startUrls, cutOffDepth, torPort) {
        // Startup message
        logger.info("Conductor now takes over control");
        // By making a set, we make sure we do unify
        // input, in order to do no more requests than we need
        this.startUrls = startUrls;

        this.cutOffDepth = cutOffDepth;

        this.torPort = torPort;

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
     */
    async run() {
        // Synchronize the db model
        await db.sequelize.sync();

        // Create a network instance
        this.network = await Network.build(
            this.torPort
        );

        // Now inserting the start urls into the database with scrape
        // timestamp=0, so they will be scraped first (with other, not yet
        // scraped data).
        // Note that we exect a csv. We then check every cell if it contains
        // a .onion url, therefor we use two nested loops.
        for (let lineOfUrls of this.startUrls) {
            for (let stringToMatch of lineOfUrls) {
                let matchedUrls = this.parser.extractOnionURI(
                    stringToMatch,
                    "" /* baseUrl */
                );
                /** @type{Parser.ParseResult} */
                for (let matchedUrl of matchedUrls) {
                    let path = matchedUrl.path || "/";
                    let baseUrl = matchedUrl.baseUrl.toLowerCase();
                    // Note: Without the await, we will get failing commits
                    // possibly we overload the database (For large numbers
                    // of initial urls)
                    // Short term: not an issue, finished in about 5 min
                    // Long term solution: Use Bulk inserts
                    await db.insertUri(
                        baseUrl, /* baseUrl */
                        path, /* path */
                        0, /* depth */
                        matchedUrl.secure
                    ).catch((err) =>{
                        logger.error(
                            "An error occured while inserting " + baseUrl +
                            "/" + path + ": " + err.toString()
                        );
                        logger.error(err.stack);
                    });
                }
            }
        }
        await this.getEntriesToDownloadPool(
            this.network.constructor.MAX_POOL_SIZE
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
        let [dbResults, moreAvailable] = await db.getEntriesAndSetFlag(
            0, // dateTime
            limit,
            this.cutOffDepth
        );
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
            successful
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
        for (let url of urlsList) {
            let pathId = "";
            try {
                [, pathId] = await db.insertUri(
                    url.baseUrl,
                    url.path,
                    dbResult.depth + 1,
                    url.secure,
                );
            } catch (e) {
                // statements
                logger.warn(e);
                // Continue, since the pathId might have not been
                // initialized.
                continue;
            }
            // Now we insert the link
            await db.insertLink(
                dbResult.pathId,
                pathId,
                networkResponse.endTime
            );
        }

        // For the case we hit 0 in the network pool and
        // this was the last request, we need to repopulate
        // the pool here, if any data was added to the database
        let limit = Network.MAX_POOL_SIZE - this.network.pool.length;
        this.getEntriesToDownloadPool(limit);
    }

    /*
    TODO:
    add functions for
        * insert initial data into the db [DONE]
        * new data from db to be downloaded add to network pool
          on POOL_LOW event (or check everytime new network data is available)
        * insert data into DB on NEW_NETWORK_DATA_AVAILABLE [DONE]
        * function to randomize ordering in the db
        * Check that all "once" listeners are reregistered after use
        * check that all functions fire appropriate events
        * The conductor module should only need to listen, the firing
          should exclusively take place in the network module.
          (Client should not be required to read up about events, but can
          use the function interface, except for callbacks)
    */

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

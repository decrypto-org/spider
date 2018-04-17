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
        // This array should never exceed the limitForDbRequest size
        this.cachedDbResults = [];
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
                        0, /* lastScraped */
                        0 /* depth */
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
        await this.runScraper();

        // Here we are sure that the handler is initialized
        this.network.startNetwork();
    }

    /*
    TODO:
    add functions for
        * insert initial data into the db
        * new data from db to be downloaded add to network pool
          on POOL_LOW event (or check everytime new network data is available)
        * insert data into DB on NEW_NETWORK_DATA_AVAILABLE
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
     * DB and sending events to the network module to receive more data.
     */
    async runScraper() {
        // Optimization: Cache from database, then pop of
        let [dbResults, initDataAvailable] = await db.getEntries();

        if (!initDataAvailable) {
            logger.info("No initial data available to start the scraped.");
            logger.info(
                "If you need to run on previous data, please contact" +
                "the developer. This feature is not yet implemented."
            );
            logger.info(
                "If you have initial data, please specify it on" +
                "the command line (as a csv file)."
            );
            process.exit(0);
        }

        this.cachedDbResults = [...new Set(
            this.cachedDbResults.concat(dbResults)
        )];

        this.network.on(
            // This is called everytime a network slot is available
            // ==> Go, get data, then network.get and finally reinsert it
            // into the database. Eventually we'll do a bulk get/insert to
            // reduce DB latency in the long run
            Network.NETWORK_READY,
            async () => {
                // The network ready event indicates, that you are now permitted
                // to make network requests. Clean up after this and call
                // the network.freeUpSlot method, to give it back for later use.
                logger.info("Received network ready event");
                if (this.cachedDbResults.length == 0) {
                    let [dbResults, moreData] = await db.getEntries();
                    this.cachedDbResults = [...new Set(
                        this.cachedDbResults.concat(
                            dbResults
                        )
                    )];
                    if (!moreData) {
                        logger.info("No more new data found");
                        this.network.freeUpSlot(true /* no new data */);
                        return;
                    }
                }

                // We want to preserve order, therefor using shift
                /** @type {DbResult} */
                let dbResult = this.cachedDbResults.shift();

                // Cutoff at given value.
                if (dbResult.depth >= this.cutOffDepth &&
                    this.cutOffDepth != -1) {
                    logger.info("Reached cutoff value. Returning early");
                    this.network.freeUpSlot(true /* no new data */);
                    return;
                }

                /** @type {network.NetworkHandlerResponse} */
                let networkResponse = await this.network.get(
                    dbResult.url,
                    dbResult.path,
                    dbResult.secure,
                );

                let successful = networkResponse.statusCode == 200;
                // We need to await this before proceeding to prevent getting
                // already scraped entries in the next step
                let [, pathId] = await db.insertUri(
                    networkResponse.url,
                    networkResponse.path,
                    networkResponse.timestamp,
                    dbResult.depth,
                    successful
                );
                await db.insertBody(
                    pathId,
                    networkResponse.body || "[MISSING]",
                    networkResponse.mimeType || "[MISSING]",
                    networkResponse.timestamp,
                    successful
                );
                // Scrape the links to other pages, then insert them into the db
                // if the download was successful and the MIME Type correct
                if (networkResponse.body == null || !successful) {
                    this.network.freeUpSlot();
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
                            0, /* last scraped */
                            dbResult.depth + 1,
                            true, /* successful */
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
                        networkResponse.timestamp
                    );
                }
                this.network.freeUpSlot();
            }
        );
    }
}
module.exports = Conductor;

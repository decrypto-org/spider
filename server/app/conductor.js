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
     * @param {number} depth - Cutoff value for the number of hops we should
     *                         take, starting from either the database or the
     *                         startUrls.
     * @param {number} torPort - Port to use for Tor proxy.
     */
    constructor(startUrls, depth, torPort) {
        // Startup message
        logger.info("Conductor now takes over control");
        // By making a set, we make sure we do unify
        // input, in order to do no more requests than we need
        this.startUrls = startUrls;

        this.depth = depth;

        // Parser init
        this.parser = new Parser();

        /**
         * Initialize the tor client, then start the spidering
         */
        const run = async () => {
            // Synchronize the db model
            await db.sequelize.sync();

            // Create a network instance
            this.network = await Network.build(torPort);

            // Now inserting the start urls into the database with scrape
            // timestamp=0, so they will be scraped first (with other, not yet
            // scraped data).
            // Note that we exect a csv. We then check every cell if it contains
            // a .onion url.
            for (let lineOfUrls of this.startUrls) {
                for (let stringToMatch of lineOfUrls) {
                    let matchedUrls = this.parser.extractOnionURI(
                        stringToMatch
                    );
                    for (let matchedUrl of matchedUrls) {
                        let path = matchedUrl[5] || "/";
                        let baseUrl = matchedUrl[4].toLowerCase();
                        // Note: Without the await, we will get failing commits
                        // possibly we overload the database (For large numbers
                        // of initial urls)
                        // Solution: Use Bulk inserts
                        await this.insertUriIntoDB(
                            baseUrl, /* baseUrl */
                            path, /* path */
                            0 /* lastScraped */
                        ).catch((err) =>{
                            logger.error(
                                "An error occured while inserting " + baseUrl +
                                "/" + path + ": " + err.toString()
                            );
                        });
                    }
                }
            }
            // Matched url will be a list of array, where each array has the
            // following properties:
            // group0: The whole url
            // group1: http or https
            // group2: indicates whether http or https (by s) was used
            // group3: Would match any www.
            // group4: Base url
            // group5: Path
        };
        run().catch((ex) => {
            logger.error(
                "Caught exception while initializing start URLs" + ex.message
            );
        });
    }

    /**
     * Insert the URI into the database
     * @param {string} baseUrl - The base url to be inserted
     * @param {string} path - The path of the uir to be inserted
     * @param {number} lastScraped - Contains a unix timestamp (ms), which
     *                               describes, when the uri was fetched last.
     * @param {number} lastSuccessful - Contains a unix timestamp (ms),
     *                                  indicating the last successful scrape.
     * @param {boolean} successful - Indicates whether the fetch was successful
     *                               [successful=true]
     * @return {UUIDV4[]} Returns the IDs of the inserted values
     *                           Those are always sorted as follows:
     *                           [baseUrlId, pathId, contentId, linkId]
     */
    async insertUriIntoDB(
        baseUrl,
        path,
        lastScraped,
        lastSuccessful=0,
        successful=true
    ) {
        if (successful) {
            lastSuccessful = lastScraped;
        }
        let baseUrlEntry, pathEntry;
        [baseUrlEntry,] = await db.baseUrl.findOrCreate({
            where: {
                baseUrl: baseUrl,
            },
            defaults: {
                baseUrl: baseUrl,
            },
        });
        [pathEntry,] = await db.path.findOrCreate({
            where: {
                baseUrlBaseUrlId: baseUrlEntry.baseUrlId,
                path: path,
            },
            defaults: {
                lastScrapedTimestamp: lastScraped,
                lastSuccessfulTimestamp: lastSuccessful,
                path: path,
                baseUrlBaseUrlId: baseUrlEntry.baseUrlId,
            },
        });
        return [baseUrlEntry.baseUrlId, pathEntry.pathId, null, null];
    }
}


module.exports = Conductor;

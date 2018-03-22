let Parser = require("./parser");
let Network = require("./network");
let {logger} = require("./library/logger");
let db = require("./models");

let EventEmitter = require("events");

let Op = db.Sequelize.Op;

/**
 * The DB Event Emitter emits an event with new DB Data everytime the
 * DB returned new data (e.g. URLS to be fetched) and promotes the data to
 * the listeners
 */
class DbEvent extends EventEmitter {
    /**
     * Event thrown when new data is gathered from the database
     */
    static get NEW_DB_DATA_EVENT() {
        return "newDbData";
    }
    /**
     * Event thrown when no new data is available from the database
     */
    static get NO_DB_DATA_EVENT() {
        return "noDbDataAvailable";
    }
}

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

        // DB Event emitter initialization
        this.dbEvent = new DbEvent();

        // Initialization of later used variables
        this.offsetForDbRequest = 0;

        /**
         * Initialize the tor client, then start the spidering
         */
        const run = async () => {
            // Synchronize the db model
            await db.sequelize.sync();

            // Create a network instance
            this.networkEvent = await Network.build(
                torPort,
                this.dbEvent
            );

            // Now inserting the start urls into the database with scrape
            // timestamp=0, so they will be scraped first (with other, not yet
            // scraped data).
            // Note that we exect a csv. We then check every cell if it contains
            // a .onion url, therefor we use two nested loops.
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
                            logger.error(err.stack);
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

            // Now we can start the spidering
            this.runScraper();
        };
        run().catch((ex) => {
            logger.error(
                "Caught exception while initializing start URLs" + ex.message
            );
        });
    }

    /**
     * Controls on run of the scraper. This includes storing found urls on the
     * DB and sending events to the network module to receive more data.
     */
    async runScraper() {
        // First register a listener for the network events (This way we see if
        // we should fetch new url data)$
        this.networkEvent.on(
            this.networkEvent.NEW_CONTENT_DATA_EVENT,
            async (
                baseUrl,
                path,
                body,
                mimeType,
                timestamp,
                successful=true
            ) => {
                // We need to await this before proceeding to prevent getting
                // already scraped entries in the next step
                let [, pathId] = await this.insertUriIntoDB(
                    baseUrl,
                    path,
                    timestamp,
                    successful
                );
                this.insertBodyIntoDB(
                    pathId,
                    body,
                    mimeType,
                    timestamp,
                    successful
                );
                this.getEntriesFromDbToNetwork();
            }
        );

        this.networkEvent.on(
            this.networkEvent.READY,
            async (numberOfAvailableSlots) => {

            }
        );

        // We now initialize the process by getting the first URLs from the
        // database and sending it over to the network. For now, we start
        // with never scraped data. Later we may use a configuranle time delta
        this.getEntriesFromDbToNetwork({offset: 10});
    }

    /**
     * Insert the URI into the database
     * @param {string} baseUrl - The base url to be inserted
     * @param {string} path - The path of the uir to be inserted
     * @param {number} lastScraped - Contains a unix timestamp (ms), which
     *                               describes, when the uri was fetched last.
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
        successful=true
    ) {
        let lastSuccessful = lastScraped;
        let [baseUrlEntry] = await db.baseUrl.findOrCreate({
            where: {
                baseUrl: baseUrl,
            },
            defaults: {
                baseUrl: baseUrl,
            },
        });
        let [pathEntry, created] = await db.path.findOrCreate({
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
        // We need to await the completion of the task here to prevent getting
        // not yet read data in the next step
        if (successful && !created) {
            await db.path.update({
                lastSuccessfulTimestamp: lastSuccessful,
                lastScrapedTimestamp: lastScraped,
            }, {
                where: {
                    baseUrlBaseUrlId: baseUrlEntry.baseUrlId,
                    path: path,
                },
            });
        } else if (!created) {
            await db.path.update({
                lastScrapedTimestamp: lastScraped,
            }, {
                where: {
                    baseUrlBaseUrlId: baseUrlEntry.baseUrlId,
                    path: path,
                },
            });
        }
        return [baseUrlEntry.baseUrlId, pathEntry.pathId, null, null];
    }

    /**
     * Inserts the body of a message as on content entry into the database.
     * This function assumes that the data is already filtered and sanitized.
     * @param {UUIDV4} pathId -- ID of the corresponding path entry.
     * @param {string} body -- A JSON or HTML String containing the body.
     * @param {string} mimeType -- A string containing the indentifier for the
     *                             mime type of the response.
     * @param {number} timestamp -- A timestamp in ms, indicating when the data
     *                              was fetched.
     * @param {boolean} successful -- Indicates whether the download was
     *                                successful or not.
     */
    async insertBodyIntoDB(
        pathId,
        body,
        mimeType,
        timestamp,
        successful=true
    ) {
        db.path.create({
            defaults: {
                scrapeTimestamp: timestamp,
                success: successful,
                contentType: mimeType,
                content: body,
                pathPathId: pathId,
            },
        });
    }

    /**
     * Retrieve entries from the database that are older or as old as the passed
     * dateTime param.
     * @param {number} dateTime -- Specify the dateTime from which the newest
     *                             entry should be. The default will only
     *                             retrieve not yet scraped entries.
     *                             [dateTime=0]
     * @param {number} limit -- Specify how many entries the function should
     *                          return. This is seen as an upper bound. If no
     *                          more matching entries are available, only the
     *                          remainder will be returned. [limit=100]
     * @param {number} offset -- Set if you have already received a certain
     *                           amount of data. This way one can gather all
     *                           entries of a certain timestamp or older.
     *                           [offset=0]
     * @return {boolean} -- Indicate whether more data is available as of now.
     *                      Note that this can change, when the network fetches
     *                      new data. If both, network and DB do not have
     *                      anything pending, we can conclude that we have
     *                      finished and exit.
     */
    async getEntriesFromDbToNetwork({dateTime=0, limit=100, offset=0} = {}) {
        let urlResult = [];
        let paths = await db.path.findAll({
            where: {
                lastScrapedTimestamp: {
                    [Op.lte]: dateTime,
                },
            },
            limit: limit,
            offset: offset,
        });
        let uriResult = [];
        for (let path of paths) {
            let baseUrl = await path.getBaseUrl();
            uriResult.push(baseUrl.baseUrl + path.path);
        }
        this.dbEvent.emit(
            DbEvent.NEW_DB_DATA_EVENT,
            urlResult
        );
        return [urlResult.length != 0, (offset + paths.length)];
    }
}


module.exports = Conductor;

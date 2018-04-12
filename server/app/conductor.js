let Parser = require("./parser");
let Network = require("./network");
let {logger} = require("./library/logger");
let db = require("./models");

let Op = db.Sequelize.Op;

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
                    await this.insertUriIntoDB(
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

    /**
     * Controls on run of the scraper. This includes storing found urls on the
     * DB and sending events to the network module to receive more data.
     */
    async runScraper() {
        // Optimization: Cache from database, then pop of
        let [dbResults, initDataAvailable] = await this.getEntriesFromDB();

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
                    let [dbResults, moreData] = await this.getEntriesFromDB();
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
                let [, pathId] = await this.insertUriIntoDB(
                    networkResponse.url,
                    networkResponse.path,
                    networkResponse.timestamp,
                    dbResult.depth,
                    successful
                );
                await this.insertBodyIntoDB(
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
                        [, pathId] = await this.insertUriIntoDB(
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
                    await this.insertLinkIntoDB(
                        dbResult.pathId,
                        pathId,
                        networkResponse.timestamp
                    );
                }
                this.network.freeUpSlot();
            }
        );
    }

    /**
     * Insert the URI into the database
     * @param {string} baseUrl - The base url to be inserted
     * @param {string} path - The path of the uir to be inserted
     * @param {number} lastScraped - Contains a unix timestamp (ms), which
     *                               describes, when the uri was fetched last.
     * @param {number} depth - Indicates the search depth at which the entry is
     *                         to be inserted.
     * @param {boolean} successful=true - Indicates whether the fetch
     *                                      was successful
     * @param {boolean} secure=false - Indicate whether the uri uses http(s)
     * @return {UUIDV4[]} Returns the IDs of the inserted values
     *                           Those are always sorted as follows:
     *                           [baseUrlId, pathId, contentId, linkId]
     */
    async insertUriIntoDB(
        baseUrl,
        path,
        lastScraped,
        depth,
        successful=true,
        secure=false,
    ) {
        logger.info("Insert new entry: " + baseUrl + path);
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
                depth: depth,
                baseUrlBaseUrlId: baseUrlEntry.baseUrlId,
                secure: secure,
            },
        });
        // Add check for modification timestamp to ensure
        // We need to await the completion of the task here to prevent getting
        // not yet read data in the next step
        // Check for last scraped needed to not overwrite previously scraped
        // versions of the URL (if we find it again and write it back to the DB)
        if (
            successful && !created &&
            pathEntry.lastScrapedTimestamp < lastScraped
        ) {
            await db.path.update({
                lastSuccessfulTimestamp: lastSuccessful,
                lastScrapedTimestamp: lastScraped,
            }, {
                where: {
                    baseUrlBaseUrlId: baseUrlEntry.baseUrlId,
                    path: path,
                },
                returning: true,
                plain: true,
            });
        } else if (!created && pathEntry.lastScrapedTimestamp < lastScraped) {
            await db.path.update({
                lastScrapedTimestamp: lastScraped,
            }, {
                where: {
                    baseUrlBaseUrlId: baseUrlEntry.baseUrlId,
                    path: path,
                },
                returning: true,
                plain: true,
            });
        }
        return [baseUrlEntry.baseUrlId, pathEntry.pathId, null, null];
    }

    /**
     * Inserts a new link into the DB. This helps us to gain an understanding,
     * how the link structure is changing over time and which information is
     * linked to each other.
     * @param {UUIDv4} sourcePathId - The ID of the originating path of the link
     * @param {UUIDv4} destinationPathId - The ID of the destination path of the
     *                                     link.
     * @param {number} timestamp - Indicator at which time the link was existent
     *                             which does not imply that the destination was
     *                             reachable, but only that the link was placed.
     *                             To find out if the target was reachable,
     *                             look for the content or path successful flags
     * @return {object} Return a link object (compare to models.link)
     */
    async insertLinkIntoDB(
        sourcePathId,
        destinationPathId,
        timestamp
    ) {
        let response = await db.link.create({
                timestamp: timestamp,
                sourcePathId: sourcePathId,
                destinationPathId: destinationPathId,
        });
        return response;
    }

    /**
     * Inserts the body of a message as on content entry into the database.
     * This function assumes that the data is already filtered and sanitized.
     * @param {UUIDV4} pathId - ID of the corresponding path entry.
     * @param {string} body - A JSON or HTML String containing the body.
     * @param {string} mimeType - A string containing the indentifier for the
     *                            mime type of the response.
     * @param {number} timestamp - A timestamp in ms, indicating when the data
     *                             was fetched.
     * @param {boolean} successful=true - Indicates whether the download was
     *                               successful or not.
     * @return {object} Returns the created content entry.
     */
    async insertBodyIntoDB(
        pathId,
        body,
        mimeType,
        timestamp,
        successful=true
    ) {
        let response = await db.content.create({
                scrapeTimestamp: timestamp,
                success: successful,
                contentType: mimeType,
                content: body,
                pathPathId: pathId,
        });
        return response;
    }

    /**
     * @typedef Link
     * @type {object}
     * @property {!UUIDv4} sourcePathId - The ID of the path entry where the
     *                                    link originated.
     * @property {!UUIDv4} destinationPathId - The ID of the target path entry.
     * @property {!number} timestamp - Indicates at which time the link was in
     *                                 place. This does not mean, that the
     *                                 target was reachable, it only indicates
     *                                 the existence of a link at that given
     *                                 point in time. To check for reachability
     *                                 please refer to the attached content
     *                                 entries. The contain a successful flag.
     */

    /**
     * @typedef DbResult
     * @type {object}
     * @property {!string} url - The base url
     * @property {!UUIDv4} baseUrlId - The ID of the base url entry.
     * @property {!string} path - The path of the entry
     * @property {!UUIDv4} pathId - The ID of the path entry.
     * @property {!number} depth - The search depth at which this entry resides.
     * @property {?string} content - If available or requested, it can contain
     *                               the content of the entry
     * @property {?UUIDv4} contentId - The ID of the content entry in the db.
     * @property {?Link} link - A Link object, indicating a link between
     *                                 two paths/sites.
     * @property {boolean} secure - Indicate if http or https should be used
     */

    /**
     * Retrieve entries from the database that are older or as old as the passed
     * dateTime param.
     * @param {number} dateTime=0 - Specify the dateTime from which the newest
     *                             entry should be. The default will only
     *                             retrieve not yet scraped entries.
     * @param {number} limit=100 - Specify how many entries the function
     *                          should return. This is seen as an upper bound.
     *                          If no more matching entries are available, only
     *                          the remainder will be returned.
     * @param {number} offset=0 - Set if you have already received a certain
     *                           amount of data. This way one can gather all
     *                           entries of a certain timestamp or older.
     * @return {Array.<DbResult>|boolean} The DbResult contains the results
     *                      returned by the Database.
     *                      The boolean indicates whether more data is available
     *                      as of now.
     *                      Note: this can change, when the network fetches
     *                      new data. If both, network and DB do not have
     *                      anything pending, we can conclude that we have
     *                      finished and exit.
     */
    async getEntriesFromDB({
        dateTime=0,
        limit=this.limitForDbRequest,
        offset=this.offsetForDbRequest,
    } = {}) {
        if (limit == 0) {
            return [[], false];
        }
        let dbResults = [];
        // Note: Since we are using Op.lte dateTime = 0, we do
        // not currently need an offset: the already scraped
        // data has no 0 timestamp anymore
        let paths = await db.path.findAll({
            where: {
                lastScrapedTimestamp: {
                    [Op.lte]: dateTime,
                },
            },
            order: [
                ["createdAt", "ASC"],
            ],
            limit: limit,
        });
        for (let path of paths) {
            let dbResult = {
                "path": path.path,
                "pathId": path.pathId,
                "depth": path.depth,
                "secure": path.secure,
                "url": null,
                "baseUrlId": null,
                "content": null,
                "link": null,
            };
            let baseUrl = await path.getBaseUrl();
            dbResult["url"] = baseUrl.baseUrl;
            dbResult["baseUrlId"] = baseUrl.baseUrlId;
            dbResults.push(dbResult);
        }
        this.offsetForDbRequest += paths.length;
        // We do not reset the offset counter yet, even if we did not find any
        // new data, since we do not know whether new data will arrive from the
        // network moduel. This is left to decide to the controller.
        let moreData = dbResults.length != 0;
        return [dbResults, moreData];
    }
}


module.exports = Conductor;

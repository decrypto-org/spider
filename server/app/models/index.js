let Logger = require("../library/logger");
let logger = Logger.logger;
let fs = require("fs");
let path = require("path");
let Sequelize = require("sequelize");
let uuidv4 = require("uuid/v4");
let basename = path.basename(__filename);

let Op = Sequelize.Op;
let db = {};

/**
 * Passing logger.silly directly to sequelize results in a TypeError (since
 * the logger seems to be uninitialized at some point). This wrapper function
 * was suggested as workaround.
 * @param {Object} value - Contains the actual value that should be logged to
 *                         the transports.
 */
function logForSequelize(value) {
    // Ignore DB log for now - this only logs the sql queries that were made
    // console.log(value);
    return;
}

let sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: "postgres",
        pool: {
            max: process.env.DB_MAX_CONNECTIONS,
            min: process.env.DB_MIN_CONNECTIONS,
            idle: 60000,
            acquire: 120000,
        },
        operatorsAliases: false,
        logging: logForSequelize,
    },
);

fs
    .readdirSync(__dirname)
    .filter((file) => {
        return (file.indexOf(".") !== 0) &&
            (file !== basename) &&
            file.slice(-3) === ".js";
    })
    .forEach((file) => {
        let model = sequelize["import"](path.join(__dirname, file));
        db[model.name] = model;
    });

Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

/**
 * Insert a new URI into the database. The values will only be inserted if not
 * yet existent. However, the return value will always contain the ID's of the
 * corresponding entries. No update will be done on the entries if they exist.
 * @param {string} baseUrl - The base url to be inserted
 * @param {śtring} subdomain - The URIs subdomain
 * @param {string} path - The path of the uir to be inserted
 * @param {number} depth - Indicates the search depth at which the entry is
 *                         to be inserted.
 * @param {boolean} secure=false - Indicate whether the uri uses http(s)
 * @param {Sequelize.transaction} transaction=undefined - The transaction to be
 *                                                      used for this insert.
 *                                                      This ensures higher
 *                                                      writing performance,
 *                                                      since only one commit
 *                                                      will be executed for
 *                                                      a bunch of insertions
 * @return {UUIDV4[]} Returns the IDs of the inserted values
 *                           Those are always sorted as follows:
 *                           [baseUrlId, pathId]
 */
db.insertUri = async function(
    baseUrl,
    subdomain,
    path,
    depth,
    secure=false,
    transaction=undefined
) {
    logger.info("Insert new entry: " + baseUrl + path);
    let [baseUrlEntry] = await db.baseUrl.findOrCreate({
        where: {
            baseUrl: baseUrl,
            subdomain: subdomain,
        },
        defaults: {
            baseUrl: baseUrl,
            subdomain: subdomain,
        },
        transaction: transaction,
    });
    let random = Math.random();
    let [pathEntry] = await db.path.findOrCreate({
        where: {
            baseUrlBaseUrlId: baseUrlEntry.baseUrlId,
            path: path,
            subdomain: subdomain,
        },
        defaults: {
            lastStartedTimestamp: 0,
            lastFinishedTimestamp: 0,
            lastSuccessfulTimestamp: 0,
            path: path,
            depth: depth,
            baseUrlBaseUrlId: baseUrlEntry.baseUrlId,
            secure: secure,
            random: random,
            inProgress: false,
        },
        transaction: transaction,
    });
    return [baseUrlEntry.baseUrlId, pathEntry.pathId];
};

db.queriesToRetry = {};

/**
 * @typedef {URIDefinition}
 * @type {Object}
 * @property {!string} subdomain Potential subdomains
 * @property {!string} baseUrl The baseUrl of the URI
 * @property {!string} path The path part of the URI
 * @property {!number} depth The search depth at which this entry was found
 * @property {!boolean} secure Indicates whether a secure connection should
 *                             be used or not
 */
/**
 * Insert a bulk of uris into the baseUrls and paths table.
 * In order to achieve the same result as with findOrCreate, we create a unique
 * index on (path, baseUrlId) in paths and a unique index on baseUrl in
 * baseUrls. We then first try to insert the batch of baseUrls into the
 * database. We add a "ON CONFLICT DO NOTHING" to every request, so we only get
 * the successful entries in the return value. We then calculate the remainder
 * (unsuccessful inserts) and get them by findAll.
 * This way we retrieve all the baseUrlIds needed to insert the paths.
 * For the paths we just try to insert them, again with the ON CONFLICT DO
 * NOTHING set. We do not have to worry about the not inserted paths, since
 * they are already present.
 * @param  {Array.<URIDefinition>} uriDefinitions - All the URIs that should be
 *                                                  inserted if not yet existent
 * @param {number} numOfRetries=3 How often should a request that times out be
 *                                retried
 * @return {Array.<UUIDv4>} Return the touched pathIds
 */
db.bulkInsertUri = async function(
    uriDefinitions,
    numOfRetries=3
) {
    /* eslint-disable no-multi-str */
    // First: create SQL request for bulkCreate ON CONFLICT DO NOTHING
    // This is not yet implemented in sequelize, so we write our own version
    // here. Feedback is currently stale, so not hoping that it will be resolved
    // soon
    // We need to generate the uuid on our own, but we can make use of automatic
    // insertion of updatedAt/createdAt times
    // We cannot have duplicates in our insertion list, so we have to filter
    // those

    /**
     * Executes a raw query with the provided string.
     * Used to enable retries
     * @param  {String} queryString  The SQL query string with placeholders
     *                               that should be used for the query
     * @param  {Array.<String|number|boolean>} replacements Replacements for the
     *                                                      placeholders
     * @return {Object}              Returns the raw returnvalue of the db
     */
    async function executeQuery(queryString, replacements) {
        let result = await db.sequelize.query(
            queryString,
            {replacements: replacements}
        ).catch((err) => {
            logger.error(err.message);
            logger.error(err.stack);
            return null;
        });
        return result;
    }

    // Filter to remove duplicates
    uriDefinitions = uriDefinitions.filter((uriDefinition, index, self) => {
        let auxiliaryIndex = self.findIndex((secondaryUriDefinition) => {
            if (!uriDefinition.path) {
                // in some cases path is null/undefined. Since we do not allow
                // NULL in the DB, we must set it here to ""
                uriDefinition.path = "";
            }
            return secondaryUriDefinition.baseUrl === uriDefinition.baseUrl
            && secondaryUriDefinition.path === uriDefinition.path;
        });
        return index == auxiliaryIndex;
    });
    if (uriDefinitions.length == 0) {
        return {};
    }
    // Now lets build those requests:
    let baseUrlRequestString = "\
    LOCK TABLE ONLY \"baseUrls\" IN SHARE ROW EXCLUSIVE MODE;\
    INSERT INTO \"baseUrls\" (\"baseUrlId\", \"baseUrl\")\n\
        VALUES\n\
    ";
    let pathRequestString = "\
    LOCK TABLE ONLY \"paths\" IN SHARE ROW EXCLUSIVE MODE;\
    INSERT INTO \"paths\"\n\
        (\"pathId\",\n\
         \"lastStartedTimestamp\",\n\
         \"lastFinishedTimestamp\",\n\
         \"inProgress\",\n\
         \"lastSuccessfulTimestamp\",\n\
         \"depth\",\n\
         \"path\",\n\
         \"secure\",\n\
         \"random\",\n\
         \"baseUrlBaseUrlId\",\n\
         \"subdomain\"\n\
        )\
        VALUES\n\
    ";
    // First we have to build the baseUrl insertion, since for the path
    // we need to know the actual baseUrlIds
    let baseUrlDefinitions = uriDefinitions.filter(
        (uriDefinition, index, self) => {
            let auxiliaryIndex = self.findIndex((secondaryUriDefinition) => {
                return uriDefinition.baseUrl === secondaryUriDefinition.baseUrl;
            });
            return auxiliaryIndex == index;
        }
    );
    baseUrlDefinitions.sort((a, b) => {
        let primaryX = a.baseUrl.toLowerCase();
        let primaryY = b.baseUrl.toLowerCase();
        return primaryX <= primaryY;
    });
    let replacementsForBaseUrlRequest = [];
    for (let i = 0; i < baseUrlDefinitions.length; i++) {
        let newBaseUrlId = uuidv4();
        let baseUrlDefinition = baseUrlDefinitions[i];
        if (!baseUrlDefinition.baseUrl) {
            continue; // If baseUrl was empty, we just ignore this case
        }
        let value = "(?, ?)";
        replacementsForBaseUrlRequest.push(newBaseUrlId);
        replacementsForBaseUrlRequest.push(baseUrlDefinition.baseUrl);
        if (i == baseUrlDefinitions.length - 1) {
            value += "\n";
        } else {
            value += ",\n";
        }
        baseUrlRequestString += value;
    }
    baseUrlRequestString += "ON CONFLICT (\"baseUrl\")\n\
    DO UPDATE SET \"numberOfHits\" = \"baseUrls\".\"numberOfHits\" + 1\n\
    RETURNING \"baseUrlId\", \"baseUrl\"";
    /** @type {Array.<Array|number>} baseUrlReturnValue contains two entries,
     *                               one Array and a number, indicating the
     *                               number of affected rows. Since we
     *                               constructed the query such that all inputs
     *                               are affecte, the size of the return array
     *                               and the number should be equal. The array
     *                               itself contains objects, indexed by column
     *                               name.
     */
    let baseUrlRetryCounter = 0;
    let baseUrlReturnValue = await executeQuery(
        baseUrlRequestString,
        replacementsForBaseUrlRequest
    );
    while (baseUrlReturnValue == null && baseUrlRetryCounter < numOfRetries) {
        baseUrlRetryCounter += 1;
        baseUrlReturnValue = await executeQuery(
            baseUrlRequestString,
            replacementsForBaseUrlRequest
        );
    }
    if (baseUrlReturnValue == null) {
        logger.error("Could not insert baseUrls successfully.");
        logger.error(
            "Failed on \n"
            + baseUrlRequestString + "\n"
            + JSON.stringify(replacementsForBaseUrlRequest)
        );
        return []; // This allows to continue without interruption
    }
    baseUrlReturnValue = baseUrlReturnValue[0];

    let baseUrlIdByBaseUrl = {};
    for (let i = 0; i < baseUrlReturnValue.length; i++) {
        let baseUrlEntry = baseUrlReturnValue[i];
        baseUrlIdByBaseUrl[baseUrlEntry.baseUrl] = baseUrlEntry.baseUrlId;
    }

    let replacementsForPathRequest = [];
    uriDefinitions.sort((a, b) => {
        let primaryX = a.path.toLowerCase();
        let primaryY = b.path.toLowerCase();
        if (primaryX === primaryY) {
            // Note: we can use the baseUrl as secondary sorting,
            // since we already uniqueified baseUrl/Path pairs above
            let secondaryX = a.baseUrl.toLowerCase();
            let secondaryY = b.baseUrl.toLowerCase();
            return secondaryX < secondaryY;
        }
        return primaryX < primaryY;
    });
    for (let i = 0; i < uriDefinitions.length; i++) {
        let newPathId = uuidv4();
        let random = Math.random();
        let uriDefinition = uriDefinitions[i];
        let path = uriDefinition.path;
        let value = "( ?, 0, 0, FALSE, 0, ?, ?, ?, ?, ?, ?)";
        replacementsForPathRequest.push(...[
            newPathId,
            uriDefinition.depth,
            path,
            uriDefinition.secure,
            random,
            baseUrlIdByBaseUrl[uriDefinition.baseUrl],
            uriDefinition.subdomain,
        ]);
        if (i == uriDefinitions.length - 1) {
            value += "\n";
        } else {
            value += ",\n";
        }
        pathRequestString += value;
    }
    pathRequestString += "ON CONFLICT (\
        \"baseUrlBaseUrlId\",\
        \"path\",\
        \"subdomain\")\n\
    DO UPDATE SET \"numberOfHits\" = \"paths\".\"numberOfHits\" + 1\n\
    RETURNING \"pathId\"";
    let pathRetryCounter = 0;
    let pathsReturnValue = await executeQuery(
        pathRequestString,
        replacementsForPathRequest
    );
    while (pathsReturnValue == null && pathRetryCounter < numOfRetries) {
        pathRetryCounter += 1;
        pathsReturnValue = await executeQuery(
            pathRequestString,
            replacementsForPathRequest
        );
    }
    if (pathsReturnValue == null) {
        logger.error("Could not insert paths successfully.");
        logger.error(
            "Failed on \n"
            + pathRequestString + "\n"
            + JSON.stringify(replacementsForPathRequest)
        );
        return []; // This allows to continue without interruption
    }
    pathsReturnValue = pathsReturnValue[0];
    return pathsReturnValue.map((pathIdObj) => {
        return pathIdObj.pathId;
    });
    /* eslint-enable no-multi-str */
};

/**
 * Update the URI entry with new data. This is typically done after a network
 * request finished (successfully or not). This method won't insert any data
 * into the database, only update already existing entries. (The updated entry
 * is naturally the one just downloaded, so only one at a time will be updated)
 * @param {UUIDv4} baseUrlId - The ID of the baseUrl entry to be updated
 * @param {UUIDv4} pathId - The ID of the path entry to be updated
 * @param {number} lastStartedTimestamp - Contains the timestamp of the start of
 *                                        the download
 * @param {number} lastFinishedTimestamp - Contains the timestamp when the last
 *                                         download finished (independent of if
 *                                         it was successful or not)
 * @param {boolean} secure=false - Indicate whether a secure or insecure
 *                                 connection was used
 * @param {boolean} successful=true - Indicate whether the download was finished
 *                                    successfully or not. This will accordingly
 *                                    set the lastSuccessfulTimestamp to
 *                                    lastFinishedTimestamp (if set to true)
 * @param {boolean} finished=true - If set to true, this will reset the
 *                                  inProgress flag to false. Note that
 *                                  successful=true implies that the request is
 *                                  finished.
 */
db.updateUri = async function(
    baseUrlId,
    pathId,
    lastStartedTimestamp,
    lastFinishedTimestamp,
    secure=false,
    successful=true,
    finished=true,
) {
    let inProgress = true;
    if (finished) {
        inProgress = false;
    }
    let updateObj = {
        lastStartedTimestamp,
        lastFinishedTimestamp,
        secure,
        inProgress,
    };
    let whereClause = {
        baseUrlBaseUrlId: baseUrlId,
        pathId: pathId,
    };
    if (successful) {
        updateObj["lastSuccessfulTimestamp"] = lastFinishedTimestamp;
        updateObj["inProgress"] = false;
    } else if (finished) {
        updateObj["inProgress"] = false;
    }
    await db.path.update(updateObj, {
        where: whereClause,
    });
};

/**
 * Inserts the body of a message as on content entry into the database.
 * This function assumes that the data is already filtered and sanitized.
 * @param {UUIDV4} pathId - ID of the corresponding path entry.
 * @param {string} body - A JSON or HTML String containing the body.
 * @param {string} mimeType - A string containing the indentifier for the
 *                            mime type of the response.
 * @param {number} timestamp - A timestamp in ms, indicating when the data
 *                             was fetched.
 * @param {number} statusCode=200 - HTTP Status code returned. Indicates whether
 *                                  the download was successful or not.
 * @return {object} Returns the created content entry.
 */
db.insertBody = async function(
    pathId,
    body,
    mimeType,
    timestamp,
    statusCode=200
) {
    let response = await db.content.create({
            scrapeTimestamp: timestamp,
            contentType: mimeType,
            content: body,
            pathPathId: pathId,
            statusCode: statusCode,
    });
    return response;
};

/**
 * Resets the inProgress flag. The timeDelta parameter describes how high the
 * timedelta of the lastModified flag has to be in order to be a stale entry.
 * If set to 0, every entry gets reset (this is especially useful to
 * restart the scraper after it was killed or crashed)
 * @param {number} timeDelta=0 - Indicate how long an entry has to be in
 *                               onProgress mode to be considered stale.
 */
db.resetStaleEntries = async function(
    timeDelta
) {
    if (timeDelta != 0 && !timeDelta) {
        timeDelta = 0;
    }
    let latestStaleTime = (new Date).getTime() - timeDelta;
    await db.path.update(
        {
            inProgress: false,
        },
        {
            where: {
                inProgress: true,
                updatedAt: {
                    [Op.lte]: latestStaleTime,
                },
            },

        },
    );
};

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
 *                                 entries. They contain a successful flag.
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
 * dateTime param
 * @param {number} dateTime=0 - Specify the dateTime from which the newest
 *                             entry should be. The default will only
 *                             retrieve not yet scraped entries.
 * @param {number} limit=100 - Specify how many entries the function
 *                          should return. This is seen as an upper bound.
 *                          If no more matching entries are available, only
 *                          the remainder will be returned
 * @param {number} offset=0 - Set if you have already received a certain
 *                           amount of data. This way one can gather all
 *                           entries of a certain timestamp or older
 * @param {number} cutoffValue=1 - Set which is the deepest entry one should
 *                                 resolve. This ensures controlled termination
 *                                 of the scraper
 * @param {Array.<UUIDv4>} excludedHosts=[] In order to not fill the memory up
 *                                          with entries that cannot yet be
 *                                          downloaded, one can pass an array
 *                                          of baseUrlIds that should be ignored
 * @return {Array.<DbResult>|boolean} The DbResult contains the results
 *                      returned by the Database.
 *                      The boolean indicates whether more data is available
 *                      as of now.
 *                      Note: this can change, when the network fetches
 *                      new data. If both, network and DB do not have
 *                      anything pending, we can conclude that we have
 *                      finished and exit.
 */
db.getEntriesRandomized = async function({
    dateTime=0,
    limit=100,
    cutoffValue=1,
    excludedHosts=[],
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
            lastStartedTimestamp: {
                [Op.lte]: dateTime,
            },
            inProgress: {
                [Op.eq]: false,
            },
            depth: {
                [Op.lte]: cutoffValue,
            },
            baseUrlBaseUrlId: {
                [Op.notIn]: excludedHosts,
            },
        },
        order: [
            ["depth", "ASC"],
            ["random", "DESC"],
        ],
        limit: limit,
        include: [db.baseUrl],
    });

    // collect pathIds for the update
    let pathIds = paths.map((path) => path.pathId);

    // Do a update with the same conditions as the get.
    // This should never lead to issues, since only one
    // getter is always run at the same time.
    await db.path.update(
        {inProgress: true},
        {
            where: {
                pathId: {
                    [Op.in]: pathIds,
                },
            },
        },
    );

    for (let path of paths) {
        let dbResult = {
            "path": path.path,
            "pathId": path.pathId,
            "depth": path.depth,
            "secure": path.secure,
            "url": null,
            "baseUrlId": null,
            "subdomain": path.subdomain,
            "content": null,
            "link": null,
        };
        dbResult["url"] = path.baseUrl.baseUrl;
        dbResult["baseUrlId"] = path.baseUrl.baseUrlId;
        dbResults.push(dbResult);
    }
    this.offsetForDbRequest += paths.length;
    // We do not reset the offset counter yet, even if we did not find any
    // new data, since we do not know whether new data will arrive from the
    // network moduel. This is left to decide to the controller.
    let moreData = dbResults.length != 0;
    return [dbResults, moreData];
};

/**
 * Get entries from DB ordered by network (incomin links) prioritization
 * @param  {number} dateTime      Entries which were scraped before this
 *                                timestamp may be rescraped to see a temporal
 *                                change in the network
 * @param  {number} limit         Return at most limit entries, but might be
 *                                less, if not as many entries are available.
 * @param  {number} depth         Describe the maximum depth, the scraper will
 *                                be looking for new entries
 * @param  {Array.<UUIDv4>} excludedHosts Exclude hosts, that should not be
 *                                        returned
 * @return {Array.<DbResult>}             Return an array of DbResults
 */
db.getEntriesPrioritized = async function(
    dateTime,
    limit,
    depth,
    excludedHosts
) {
    let paths = await db.path.findAll({
        where: {
            lastStartedTimestamp: {
                [Op.lte]: dateTime,
            },
            inProgress: {
                [Op.eq]: false,
            },
            depth: {
                [Op.lte]: depth,
            },
            baseUrlBaseUrlId: {
                [Op.notIn]: excludedHosts,
            },
        },
        order: [
            ["numberOfDistinctHits", "DESC"],
        ],
        limit: limit,
        include: [db.baseUrl],
    });

    // collect pathIds for the update
    let pathIds = paths.map((path) => path.pathId);

    // Do a update with the same conditions as the get.
    // This should never lead to issues, since only one
    // getter is always run at the same time.
    await db.path.update(
        {inProgress: true},
        {
            where: {
                pathId: {
                    [Op.in]: pathIds,
                },
            },
        },
    );

    let dbResults = [];
    for (let path of paths) {
        let dbResult = {
            "path": path.path,
            "pathId": path.pathId,
            "depth": path.depth,
            "secure": path.secure,
            "url": null,
            "baseUrlId": null,
            "subdomain": path.subdomain,
            "content": null,
            "link": null,
        };
        dbResult["url"] = path.baseUrl.baseUrl;
        dbResult["baseUrlId"] = path.baseUrl.baseUrlId;
        dbResults.push(dbResult);
    }
    this.offsetForDbRequest += paths.length;

    let moreData = dbResults.length != 0;
    return [dbResults, moreData];
};

/**
 * Get entries from DB that we have not yet scraped (grouped by host)
 * @param  {number} limit       How many entries that we should try to get
 * @param  {number} cutoffValue The maximum depth that we should look for
 * @return {Array.<DbResult>}   Array of DbResults
 */
db.getNeverScrapedEntries = async function(limit, cutoffValue) {
    /* eslint-disable no-multi-str */
    if (limit == 0) {
        return [[], false];
    }
    let dbResults = [];
    let pathIds = [];

    let [entriesToScrape] = await db.sequelize.query("\
    SELECT DISTINCT ON (\"paths\".\"baseUrlBaseUrlId\")\n\
        \"paths\".\"subdomain\" AS subdomain,\n\
        \"baseUrls\".\"baseUrl\" AS url,\n\
        \"baseUrls\".\"baseUrlId\" AS baseUrlId,\n\
        \"paths\".\"path\" AS path,\n\
        \"paths\".\"pathId\" AS pathId,\n\
        \"paths\".\"depth\" AS depth,\n\
        \"paths\".\"secure\" AS secure\n\
    FROM \n\
        (\n\
            SELECT \n\
                \"baseUrlBaseUrlId\",\n\
                MAX(\"lastFinishedTimestamp\") AS maxtime,\n\
                BOOL_OR(\"inProgress\") AS \"ongoing\"\n\
            FROM \n\
                \"paths\"\n\
                JOIN \"baseUrls\" ON \
                \"baseUrls\".\"baseUrlId\" = \"paths\".\"baseUrlBaseUrlId\"\n\
            GROUP BY \"paths\".\"baseUrlBaseUrlId\"\n\
            HAVING \n\
                BOOL_OR(\"inProgress\") = false \n\
                AND MAX(\"lastFinishedTimestamp\") = 0\n\
            LIMIT 2000\n\
        ) t \n\
        JOIN paths ON \"paths\".\"baseUrlBaseUrlId\" = t.\"baseUrlBaseUrlId\"\n\
        JOIN \"baseUrls\" ON\
             \"baseUrls\".\"baseUrlId\" = t.\"baseUrlBaseUrlId\"\n\
    LIMIT 2000;\n\
    ");

    for (let i = 0; i<entriesToScrape.length; i++) {
        let entryToScrape = entriesToScrape[i];
        pathIds.push(entryToScrape.pathid);
        let dbResult = {
            baseUrlId: entryToScrape.baseurlid,
            url: entryToScrape.url,
            path: entryToScrape.path,
            pathId: entryToScrape.pathid,
            depth: entryToScrape.depth,
            content: null,
            contentId: null,
            link: null,
            secure: entryToScrape.secure,
            subdomain: entryToScrape.subdomain,
        };
        dbResults.push(dbResult);
    }
    // Loop and generate return Array, as well as the pathId Array to set flag
    await db.path.update(
        {inProgress: true},
        {
            where: {
                pathId: {
                    [Op.in]: pathIds,
                },
            },
        },
    );
    return dbResults;
    /* eslint-enable no-multi-str */
};

/**
 * Sets the inProgress flag of the specified dbResult to the passed flag.
 * @param {DbResult} dbResult The dbResult for which the flag should be set
 * @param  {boolean} inProgress Pass the value to which the flag should be set
 */
db.setInProgressFlag = async function(dbResult, inProgress) {
    await db.path.update(
        {
            inProgress,
        },
        {

            where: {
                baseUrlBaseUrlId: dbResult.baseUrlId,
            },
        }
    );
};

module.exports = db;

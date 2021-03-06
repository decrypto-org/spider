"use strict";
let dotenv = require("dotenv");
let variableExpansion = require("dotenv-expand");
let franc = require("franc-min");
let stopword = require("stopword");
let stemmer = require("stemmer");
let uuidv4 = require("uuid/v4");
let commandLineArgs = require("command-line-args");
let Sequelize = require("sequelize");
let Op = Sequelize.Op;

let preprocessorEnv = dotenv.config();
variableExpansion(preprocessorEnv);

let Parser = require("../server/app/parser");

let sourceDb = require("../server/app/models");
let targetDb = require("./models");
let waitingForDbConnection = [];
let limit = parseInt(process.env.PREPROCESSOR_MAX_POOL_SIZE, 10);
let dbConnections = parseInt(process.env.PREPROCESSOR_MAX_PARALLEL, 10);
if (isNaN(limit) || limit <= 0) {
    limit = 2000;
}
if (isNaN(dbConnections) || limit <= 0) {
    dbConnections = 25;
}

let languagesToBeInserted = [
    {language: "cmn", numberOfDOcuments: 0},
    {language: "spa", numberOfDOcuments: 0},
    {language: "eng", numberOfDOcuments: 0},
    {language: "rus", numberOfDOcuments: 0},
    {language: "arb", numberOfDOcuments: 0},
    {language: "ben", numberOfDOcuments: 0},
    {language: "hin", numberOfDOcuments: 0},
    {language: "por", numberOfDOcuments: 0},
    {language: "ind", numberOfDOcuments: 0},
    {language: "jpn", numberOfDOcuments: 0},
    {language: "fra", numberOfDOcuments: 0},
    {language: "deu", numberOfDOcuments: 0},
    {language: "jav", numberOfDOcuments: 0},
    {language: "kor", numberOfDOcuments: 0},
    {language: "tel", numberOfDOcuments: 0},
    {language: "vie", numberOfDOcuments: 0},
    {language: "mar", numberOfDOcuments: 0},
    {language: "ita", numberOfDOcuments: 0},
    {language: "tam", numberOfDOcuments: 0},
    {language: "tur", numberOfDOcuments: 0},
    {language: "urd", numberOfDOcuments: 0},
    {language: "guj", numberOfDOcuments: 0},
    {language: "pol", numberOfDOcuments: 0},
    {language: "ukr", numberOfDOcuments: 0},
    {language: "fas", numberOfDOcuments: 0},
    {language: "kan", numberOfDOcuments: 0},
    {language: "mai", numberOfDOcuments: 0},
    {language: "mal", numberOfDOcuments: 0},
    {language: "mya", numberOfDOcuments: 0},
    {language: "ori", numberOfDOcuments: 0},
    {language: "gax", numberOfDOcuments: 0},
    {language: "swh", numberOfDOcuments: 0},
    {language: "sun", numberOfDOcuments: 0},
    {language: "ron", numberOfDOcuments: 0},
    {language: "pan", numberOfDOcuments: 0},
    {language: "bho", numberOfDOcuments: 0},
    {language: "amh", numberOfDOcuments: 0},
    {language: "hau", numberOfDOcuments: 0},
    {language: "fuv", numberOfDOcuments: 0},
    {language: "bos", numberOfDOcuments: 0},
    {language: "hrv", numberOfDOcuments: 0},
    {language: "nld", numberOfDOcuments: 0},
    {language: "srp", numberOfDOcuments: 0},
    {language: "tha", numberOfDOcuments: 0},
    {language: "ckb", numberOfDOcuments: 0},
    {language: "yor", numberOfDOcuments: 0},
    {language: "uzn", numberOfDOcuments: 0},
    {language: "zlm", numberOfDOcuments: 0},
    {language: "ibo", numberOfDOcuments: 0},
    {language: "nep", numberOfDOcuments: 0},
    {language: "ceb", numberOfDOcuments: 0},
    {language: "skr", numberOfDOcuments: 0},
    {language: "tgl", numberOfDOcuments: 0},
    {language: "hun", numberOfDOcuments: 0},
    {language: "azj", numberOfDOcuments: 0},
    {language: "sin", numberOfDOcuments: 0},
    {language: "koi", numberOfDOcuments: 0},
    {language: "ell", numberOfDOcuments: 0},
    {language: "ces", numberOfDOcuments: 0},
    {language: "run", numberOfDOcuments: 0},
    {language: "bel", numberOfDOcuments: 0},
    {language: "plt", numberOfDOcuments: 0},
    {language: "qug", numberOfDOcuments: 0},
    {language: "mad", numberOfDOcuments: 0},
    {language: "nya", numberOfDOcuments: 0},
    {language: "zyb", numberOfDOcuments: 0},
    {language: "pbu", numberOfDOcuments: 0},
    {language: "kin", numberOfDOcuments: 0},
    {language: "zul", numberOfDOcuments: 0},
    {language: "bul", numberOfDOcuments: 0},
    {language: "swe", numberOfDOcuments: 0},
    {language: "lin", numberOfDOcuments: 0},
    {language: "som", numberOfDOcuments: 0},
    {language: "hms", numberOfDOcuments: 0},
    {language: "hnj", numberOfDOcuments: 0},
    {language: "ilo", numberOfDOcuments: 0},
    {language: "kaz", numberOfDOcuments: 0},
    {language: "und", numberOfDOcuments: 0},
];

let languageIdsByISOString = {};

/**
 * Just print post script after a fatal error and exit the program as needed.
 * @param  {Exception} err Exception object used to print message/stack trace
 * @param {Sequelize.Transaction} transaction The transaction within the error
 *                                            was thrown. If a transaction is
 *                                            passed, it will be rolled back
 */
function finalErrorHandler(err, transaction) {
    if (transaction) {
        transaction.rollback();
    }
    console.error("For more information check the error message below:");
    console.error(err.message);
    console.error(err.stack);
    console.error("Leaving now... Bye bye");
    process.exit(-1);
}

const commandLineOptions = commandLineArgs([
    {name: "recalculate", alias: "r", type: Boolean},
    {name: "label", alias: "l", type: String},
]);

/**
 * Run the data normalization process and stop if no more contents
 * to normalize are available. The process first gets a batch of contents
 * from the database, then strips any html tags from the string.
 * After that, we do run language classification over the strings, using
 * franc.
 * Last, we write back the information to the database, into the structure
 * used for machine learning
 */
async function run() {
    // initialize: language table contains exactly 82 languages (the ones
    // supported by franc-min). They are inserted here and the keys are stored
    // in a mapping for later use.
    // First check if languages are already available. Since we use franc-min,
    // it should exactly contain 82. Otherwise: Warning and terminate, user
    // has to decide what should happen
    let returnedRows = await targetDb.language.findAll();
    if (returnedRows.length == 0) {
        // Insert languages
        returnedRows = await targetDb.language.bulkCreate(
            languagesToBeInserted,
            {
                returning: true,
            }
        );
    } else if (returnedRows.length < 78) {
        console.warn("Not all languages are available in the database.");
        console.error("This requires manual cleanup.");
        console.error("Leaving...");
        process.exit(-1);
    } // else: Nothing to do
    for (let i = 0; i < returnedRows.length; i++) {
        let language = returnedRows[i].dataValues;
        languageIdsByISOString[language.language] = language.languageId;
    }
    if (commandLineOptions.recalculate) {
        await updateCleanContents();
        return;
    }
    // Offset within the content table of
    let offset = await targetDb.cleanContent.count();
    let queryResults = [];
    let countsByLanguage = {};
    let parser = new Parser();
    let asyncStores = {};
    let promiseCounter = 0;
    do {
        queryResults = await sourceDb.content.findAll({
            where: {
                [Op.and]: [
                    {statusCode: {[Op.lt]: 400}},
                    {statusCode: {[Op.gt]: -1}},
                ],
                [Op.and]: [
                    {content: {[Op.ne]: ""}},
                    {content: {[Op.ne]: "404"}},
                    {content: {[Op.ne]: "[MISSING]"}},
                ],
            },
            offset: offset,
            limit: limit,
            order: [["createdAt", "ASC"]],
        });
        offset += queryResults.length;
        for (let i = 0; i < queryResults.length; i++) {
            let rawContent = queryResults[i];
            let err = false;
            let cleanContent = await parser.extractText(
                rawContent.content,
                rawContent.contentType,
            ).catch((error) => {
                console.error(error);
                err=true;
            });
            if (err) {
                console.warn("Could not extract content from");
                console.warn(rawContent.content);
                console.warn("Ignoring this, continuing with next");
                continue;
            }
            let language = franc(cleanContent);
            if (countsByLanguage.hasOwnProperty(language)) {
                countsByLanguage[language] += 1;
            } else {
                countsByLanguage[language] = 1;
            }
            console.log("language: " + language);
            await getDbConnection().catch((err) => {
                console.error("getDbConnection timed out. Giving up");
                process.exit(-1);
            });
            let promise = storeResult(
                cleanContent,
                language,
                rawContent.contentId,
                promiseCounter
            );
            promise.index = promiseCounter;
            asyncStores[promiseCounter] = promise;
            promise.catch(() => {}).then((taskId) => {
                let callback = null;
                while (callback == null && waitingForDbConnection.length > 0) {
                    callback = waitingForDbConnection.pop();
                    if (callback != null) {
                        callback();
                        delete asyncStores[taskId];
                    }
                }
                dbConnections += 1;
                delete asyncStores[taskId];
            });
            promiseCounter += 1;
        }
    } while (queryResults.length > 0 && offset < 700000);
    await Promise.all(Object.values(asyncStores));
    console.log("Statistics: " + JSON.stringify(countsByLanguage));
    console.log("Did not retrieve more contents. Finished.");
    console.log("Restart the process after you've added more contents");
    process.exit(0);
}

/**
 * Revisit specified contents in order to check if their postings are correctly
 * inserted. We found some empty spots - it seems that there the database
 * connection was lost and the entries were therefor only partially inserted.
 * This is now fixed by using transactions to ensure "atomicity" in the
 * insertion process
 */
async function updateCleanContents() {
    let offset = 0;
    let label = await targetDb.label.findOne(
        {
            where: {
                label: commandLineOptions.label,
            },
        }
    );
    if (!label) {
        console.log("Cannot find specified label: " + commandLineOptions.label);
        finalErrorHandler("label not found!");
    }

    let queryResults = [];
    let promiseCounter = 0;
    let upperLimit = 0;
    let asyncStores = {};
    do {
        queryResults = await targetDb.cleanContent.getContentsForUpdate(
            limit,
            label,
            targetDb.language,
            offset
        );
        upperLimit = offset + queryResults.length;
        console.log("Currently processing entries ["
            + offset +"-" + upperLimit +"]");
        for (let i = 0; i < queryResults.length; i++) {
            let currIndex = offset + i;
            console.log("Processing #" + currIndex);
            let cleanContent = queryResults[i];
            await getDbConnection().catch((err) => {
                console.error("getDbConnection timed out. Giving up");
                process.exit(-1);
            });
            let promise = storeResult(
                cleanContent.cleanContent,
                cleanContent.language.language,
                cleanContent.rawContentId,
                promiseCounter,
                cleanContent,
            );
            promise.index = promiseCounter;
            asyncStores[promiseCounter] = promise;
            promise.catch(() => {}).then((taskId) => {
                let callback = null;
                while (callback == null && waitingForDbConnection.length > 0) {
                    callback = waitingForDbConnection.pop();
                    if (callback != null) {
                        callback();
                        delete asyncStores[taskId];
                    }
                }
                dbConnections += 1;
                delete asyncStores[taskId];
            });
            promiseCounter += 1;
        }
        offset += queryResults.length;
    } while (queryResults.length >= limit);
    console.log("Did not retrieve more contents. Finished.");
    console.log("Restart the process after you've added more contents");
    process.exit(0);
}

/**
 * Returns only, if a db connection is available, otherwise blocks.
 * Acts a bit like a semaphore.
 * @return {Promise} Promise is resolved as soon as a DB connection is available
 */
async function getDbConnection() {
    if (dbConnections > 0) {
        dbConnections -= 1;
        return;
    }
    return new Promise((resolve, reject) => {
        // We do not timeout, therefor we do not have to store the position
        // to remove the "callback"
        waitingForDbConnection.push(() => {
            resolve();
            return;
        });
    });
}

/* eslint-disable no-unused-vars */
/**
 * Normalize the inputs and store them back onto the database
 * @param {string} cleanString Cleaned (Stripped) content string
 * @param {string} language    ISO 639 language string (3 chars)
 * @param {UUIDv4} originContentId The id of the raw content string, used
 *                                 as link to all the other structures stored
 * @param {number} id              The id of the async task. When resolved, this
 *                                 id is returned
 * @param {CleanContent} cleanContentModel If passed, no new one will be created
 *                                         but the old one will be updated. If
 *                                         empty a new one with a new ID will be
 *                                         created.
 * @return {number} Store task id is returned when finished. This is useful
 *                  in order to remove the corresponding promise from the array,
 *                  which is needed, otherwise we'd fill up the memory with
 *                  resolved promises.
 */
async function storeResult(
    cleanString,
    language,
    originContentId,
    id,
    cleanContentModel,
) {
    // IF english ==> apply:
    // 1. punctuation removal
    // 2. tokenization (extract terms in order)
    // 3. stem (e.g. for english languages)
    let emptyContainedList = cleanString.split(/[\s\\/:.@"]/);
    let termList = [];
    for (let i = 0; i < emptyContainedList.length; i++) {
        let term = emptyContainedList[i];
        if (term != "") {
            termList.push(term);
        }
    }
    termList = removeStopWords(termList, language);
    if (termList.length == 0) {
        console.warn("Terms list empty, input did only contain stop words");
        console.warn("Inserting empty string");
        termList.push("[EMPTY]");
    }
    let dict = {};
    let stemmedTerms = [];
    for (let i = 0; i < termList.length; i++) {
        let term = termList[i];
        if (language === "eng") {
            term = stemmer(term);
        }
        if ( stemmedTerms.indexOf(term) == -1 ) {
            stemmedTerms.push(term);
        }
        if (dict.hasOwnProperty(term)) {
            dict[term].push(i);
        } else {
            dict[term] = [i];
        }
    }
    let transaction = await targetDb.sequelize.transaction();
    let cleanContentInstance;
    if (!cleanContentModel) {
        try {
            cleanContentInstance = await targetDb.cleanContent.findOrCreate({
                where: {rawContentId: originContentId},
                defaults: {
                    cleanContent: cleanString,
                    rawContentId: originContentId,
                    languageLanguageId: languageIdsByISOString[language],
                },
                transaction: transaction,
            });
            cleanContentInstance = cleanContentInstance[0];
        } catch (e) {
            // statements
            console.log(e);
            finalErrorHandler(e, transaction);
        }
    } else {
        cleanContentInstance = cleanContentModel;
    }
    let terms = await targetDb.term.bulkUpsert(stemmedTerms, transaction).catch(
        (err) => {
        console.error("An error occured while inserting terms in the database");
        console.error("This occured most likely due to a connection issue");

        finalErrorHandler(err, transaction);
    });
    if (terms.length != stemmedTerms.length) {
        console.error("Not all terms were correctly inserted into the DB");
        console.error("Aborting process...");
        console.error("Bye bye...");
        process.exit(-1);
    }
    for (let i = 0; i < stemmedTerms.length; i++) {
        let termObj = terms[i];
        let term = stemmedTerms[i];
        let postingId = uuidv4();
        let posting = await targetDb.posting.findOne({
            where: {
                cleanContentCleanContentId: cleanContentInstance.cleanContentId,
                termTermId: termObj.termId,
            },
        });
        if (!posting) {
            posting = await targetDb.posting.create({
                postingId,
            }, {transaction: transaction}).catch(
            (err) => {
                console.error("An error occured while creating a posting");
                console.error("This occured most likely due to a" +
                    " connection issue");
                finalErrorHandler(err, transaction);
            });
        }
        // Side effect: not only associated but also stored on db
        await posting.setCleanContent(
            cleanContentInstance,
            {transaction: transaction}
        ).catch((err) => {
            console.error("An error occured while updating a posting -Content");
            console.error("This occured most likely due to a connection issue");
            finalErrorHandler(err, transaction);
        });
        await posting.setTerm(termObj, {transaction: transaction}).catch(
        (err) => {
            console.error(cleanContentInstance.cleanContent);
            console.error(termObj.term);
            console.error("An error occured while updating a posting -Term");
            console.error("This occured most likely due to a connection issue");
            finalErrorHandler(err, transaction);
        });
        let positions = await targetDb.position.bulkUpsert(
            dict[term],
            transaction
        ).catch((err) => {
            console.error("An error occured while upserting positions");
            console.error("This occured most likely due to a connection issue");
            finalErrorHandler(err, transaction);
        });
        await posting.addPositions(positions, {transaction: transaction}).catch(
        (err) => {
            console.error("An error occured while updating a posting -pos");
            console.error("This occured most likely due to a connection issue");
            finalErrorHandler(err, transaction);
        });
    }
    transaction.commit();
    return id;
}
/* eslint-enable no-unused-vars */

/**
 * This function removes the stop words if the library supports the given
 * language. If the language is not supported, the input is returned unchanged.
 * This allows you to detect it, while still going on as if everything worked
 * out.
 * *Supported languages*
 *     ar - Modern Standard Arabic
 *     bn - Bengali
 *     br - Brazilian Portuguese
 *     de - German
 *     en - English
 *     es - Spanish
 *     fr - French
 *     hi - Hindi
 *     it - Italian
 *     ja - Japanese
 *     nl - Dutch
 *     pl - Polish
 *     pt - Portuguese
 *     ru - Russian
 *     sv - Swedish
 *     zh - Chinese Simplified
 * Since the language input is of a different format, we define a mapping here.
 * @param  {Array.<string>} wordsList The input list of words. Needs to be split
 *                                    up before passing to this function
 * @param  {string} language  An ISO language identifier string, used to select
 *                            the correct removal list
 * @return {Array.<string>}           The result is a list of words, without
 *                                    the stop words of the input
 */
function removeStopWords(wordsList, language) {
    let stopWordsLang = undefined;
    switch (language) {
        case "arb":
            stopWordsLang = stopword.ar;
            break;
        case "ben":
            stopWordsLang = stopword.bn;
            break;
        case "por":
            stopWordsLang = stopword.br;
            break;
        case "deu":
            stopWordsLang = stopword.de;
            break;
        case "eng":
            stopWordsLang = stopword.en;
            break;
        case "spa":
            stopWordsLang = stopword.es;
            break;
        case "fra":
            stopWordsLang = stopword.fr;
            break;
        case "hin":
            stopWordsLang = stopword.hi;
            break;
        case "ita":
            stopWordsLang = stopword.it;
            break;
        case "jpn":
            stopWordsLang = stopword.ja;
            break;
        case "nld":
            stopWordsLang = stopword.nl;
            break;
        case "pol":
            stopWordsLang = stopword.pl;
            break;
        case "rus":
            stopWordsLang = stopword.ru;
            break;
        case "swe":
            stopWordsLang = stopword.sv;
            break;
        case "cmn":
            stopWordsLang = stopword.zh;
            break;
        default:
            return wordsList;
    }
    // stopWordsLang is now defined and can be used for stop word removal
    return stopword.removeStopwords(
        wordsList,
        stopWordsLang
    );
}


run();

"use strict";
let dotenv = require("dotenv");
let variableExpansion = require("dotenv-expand");
let uuidv4 = require("uuid/v4");
let textract = require("textract");
let franc = require("franc-min");
let Sequelize = require("sequelize");
let Op = Sequelize.Op;

let preprocessorEnv = dotenv.config();
variableExpansion(preprocessorEnv);

let sourceDb = require("../server/app/models");
let targetDb = require("./models");
let limit = parseInt(process.env.NETWORK_MAX_POOL_SIZE, 10);
if (isNaN(limit) || limit <= 0) {
    limit = 2000;
}

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
    // First sync the new tables, if that has not yet happened.
    await targetDb.sequelize.sync();
    // Offset within the content table of
    let offset = await targetDb.cleanContent.count();
    let queryResults = [];
    let countsByLanguage = {};
    do {
        queryResults = await sourceDb.content.findAll({
            where: {
                statusCode: {
                    [Op.lt]: 400
                },
                [Op.and]: [
                    {content: {[Op.ne]: ''}},
                    {content: {[Op.ne]: '404'}},
                    {content: {[Op.ne]: '[MISSING]'}}
                ]
            },
            offset: offset,
            limit: limit,
            order: [["createdAt", "ASC"]],
        });
        offset += queryResults.length;
        for (let i = 0; i < queryResults.length; i++) {
            let rawContent = queryResults[i];
            let err = false;
            let cleanContent = await extractText(
                rawContent.content,
                rawContent.contentType,
            ).catch((error) => {
                console.error(error);
                err=true;
            });
            if(err){
                continue;
            }
            let language = franc(cleanContent);
            if (countsByLanguage.hasOwnProperty(language)){
                countsByLanguage[language] += 1;
            } else {
                countsByLanguage[language] = 1;
            }
            console.log("language: " + language);
            // Write back to db:
            // First: Clean result, language, then insert terms and
            // add links over invertedIndex as well as insert positions
            // Probably do this also in a separate method
        }
    } while (queryResults.length > 0 && offset < 20000);
    console.log("Statistics: " + JSON.stringify(countsByLanguage));
    console.log("Did not retrieve more contents. Finished.");
    console.log("Restart the process after you've added more contents");
    process.exit(0);
}

/**
 * Extracts text from the given string using textract. This needs
 * to know the mimetype, in order to select the correct extractor.
 * Since the mimeType is stored within the database, this is not an issue
 * @param  {string} rawString The string from which the text should be extracted
 * @param  {string} mimeType  The mime type of the passed string. This will
 *                            usually be a text/html or plain text format
 * @return {Promise}          Resolved with the extracted text, otherwise
 *                            rejected with a string error message
 */
async function extractText(rawString, mimeType) {
    return new Promise((resolve, reject) => {
        textract.fromBufferWithMime(
            mimeType,
            Buffer.from(rawString, "utf8"),
            (error, text) => {
                if (error) {
                    reject(error);
                    return;
                } else {
                    resolve(text);
                    return;
                }
            }
        );
    });
}

/**
 * Normalize the inputs and store them back onto the database  
 * @param  {string} cleanString Cleaned (Stripped) content string
 * @param  {string} language    ISO 639 language string (3 chars)
 */
async function storeResult (cleanString, language) {
    
}
// 1. Get from DB (pool)
// 2. Extract content
// 3. Detect language
// 4. Write back to DB

run();

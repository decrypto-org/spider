let Parser = require("../server/app/parser");
let dotenv = require("dotenv");
let variableExpansion = require("dotenv-expand");
let uuidv4 = require("uuid/v4");

let extractorEnv = dotenv.config();
extractorEnv = variableExpansion(extractorEnv);

// We have to first load the settings from the .env file, hence
// we require the db afterwards
let db = require("../server/app/models");

let Op = db.Sequelize.Op;
let parser = new Parser();

let queryResults = [];
let currentOffset = 0;
let limit = 2000;
let errorCount = 0;

function getDbResult(queryResult) {
    return {
        "url": queryResult.baseUrl,
        "baseUrlId": queryResult.baseUrlBaseUrlId,
        "path": queryResult.path,
        "pathId": queryResult.pathId,
        "depth": queryResult.depth,
        "content": queryResult.content,
        "contentId": queryResult.contentId,
        "secure": queryResult.secure,
        "time": queryResult.lastFinishedTimestamp,
    };
}

async function insertParseResultsIntoDb (parseResults, dbResult) {
    let linkList = [];
    let uriList = [];

    if (parseResults.length <= 0) {
        return;
    }

    for(let url of parseResults) {
        let path = url.path || "/";
        uriList.push({
            baseUrl: url.baseUrl,
            subdomain: url.subdomain,
            path: path,
            depth: dbResult.depth + 1,
            secure: url.secure
        });
    }

    let pathIds = await db.bulkInsertUri(uriList);

    let linkReplacements = [];

    let linkInsertString = "" +
    "LOCK TABLE ONLY \"links\" IN SHARE ROW EXCLUSIVE MODE;\n" +
    "INSERT INTO links \n" +
        "(\n" +
            "\"linkId\",\n" +
            "\"sourcePathId\",\n" + 
            "\"destinationPathId\",\n" +
            "\"timestamp\"\n" +
        ")\n" +
    "VALUES \n";

    for (let i = 0; i < pathIds.length; i++) {
        let pathId = pathIds[i];
        linkReplacements.push(...[
            uuidv4(),
            dbResult.pathId,
            pathId,
            dbResult.time,]
        );
        if (i == pathIds.length - 1) {
            linkInsertString += "(?, ?, ?, ?)\n";
        } else {
            linkInsertString += "(?, ?, ?, ?),\n";
        }
    }
    linkInsertString += "ON CONFLICT (\"sourcePathId\", \"destinationPathId\")"+
    "DO NOTHING;"

    try {
        await db.sequelize.query(
            linkInsertString,
            {replacements: linkReplacements}
        );
    } catch (err) {
        console.error(err.message);
        console.error(err.stack);
        return;
    }

    if(pathIds.length <= 0){
        return;
    }
    
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
        console.error(err.message);
        console.error(err.stack);
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
        console.error(err.message);
        console.error(err.stack);
    });
}

async function orchestrateExtraction () {
    do {
        let getContentsForExtractionString = "" +
        "SELECT *\n" +
        "FROM\n" +
        "    paths\n" +
        "    INNER JOIN contents ON contents.\"pathPathId\" = " +
        "paths.\"pathId\"\n" +
        "    INNER JOIN \"baseUrls\" ON \"baseUrls\".\"baseUrlId\" = " +
        "paths.\"baseUrlBaseUrlId\"\n" +
        "WHERE\n" +
        "    paths.\"lastSuccessfulTimestamp\" > 0\n" +
        "    AND contents.content != '404'\n" +
        "    AND contents.content != ''\n" +
        "ORDER BY paths.\"lastSuccessfulTimestamp\" ASC\n" +
        "LIMIT 2000\n" +
        "OFFSET ?";
        let replacements = [currentOffset];
        try {
            queryResults = await db.sequelize.query(
                getContentsForExtractionString,
                {replacements: replacements}
            );
        } catch(err) {
            console.error(err.message);
            console.error(err.stack);
            errorCount += 1;
            if (errorCount > 10 ) {
                console.error("Could not perform, giving up.");
                process.exit(-1);
            }
            continue;
        }
        errorCount = 0;
        queryResults = queryResults[0];
        currentOffset += queryResults.length;

        // dbResult = await db.path.findAll({
        //     where: {
        //         lastSuccessfulTimestamp: {
        //             [Op.gt]: 0,
        //         },
        //     },
        //     order: [
        //         ["lastSuccessfulTimestamp", "ASC"],
        //     ],
        //     include: [{
        //         model: db.content,
        //     }, {
        //         model: db.baseUrl,
        //     }],
        //     offset: currentOffset,
        //     limit: limit,
        // });
        for (let i = 0; i < queryResults.length; i++) {
            let queryResult = queryResults[i];
            console.log("lookin at entry " + JSON.stringify(queryResult));
            let dbResult = getDbResult(queryResult);
            let parseResults = parser.extractOnionURI(
                dbResult.content,
                dbResult,
                false
            );
            await insertParseResultsIntoDb(parseResults, dbResult);
        }
    } while (dbResult.length > 0);
}

orchestrateExtraction();

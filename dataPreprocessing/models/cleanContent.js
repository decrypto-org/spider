"use strict";
let Sequelize = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    const CleanContent = sequelize.define("cleanContent", {
        cleanContentId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        cleanContent: {
            type: DataTypes.TEXT,
            defaultValue: "",
        },
        rawContentId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        legal: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        legalCertainty: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
        },
        classCertainty: {
            type: DataTypes.DOUBLE,
            defaultValue: 0,
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "rawContentId", order: "DESC"},
                ],
            },
        ],
    });
    CleanContent.associate = function(models) {
        CleanContent.belongsTo(models.language, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        CleanContent.belongsTo(models.label, {
            as: "primaryLabel",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };

    /**
     * Get the bag of words vector from the database for specified clean
     * content. Note: This is slow... Todo: Improve performance, however,
     * I do not see a good option yet
     * @param  {UUIDv4} cleanContentId The clean content id for which the BoW
     *                                 should be built
     * @return {Array.<number>}        Returns the BoW as JSON array, which can
     *                                 be interpreted as rudimentary vector.
     *                                 This representation is sufficient for the
     *                                 used SVM library
     */
    async function getBagOfWords(cleanContentId) {
        /* eslint-disable no-multi-str */
        let queryString = "\
SELECT COUNT(\"postingPositions\".\"positionId\")\n\
FROM\n\
    (\n\
        SELECT COUNT(postings.\"termTermId\"), terms.\"termId\"\n\
        FROM\n\
            postings\n\
            RIGHT OUTER JOIN terms ON terms.\"termId\" = \
            postings.\"termTermId\" AND postings.\"cleanContentCleanContentId\"\
             = 'ab294f59-c8ed-4f45-b4a6-dff6d6f109a2'\n\
        GROUP BY terms.\"termId\"\n\
    ) boolean\n\
    LEFT OUTER JOIN postings ON postings.\"termTermId\" = boolean.\"termId\"\
     AND postings.\"cleanContentCleanContentId\" =\
      'ab294f59-c8ed-4f45-b4a6-dff6d6f109a2'\n\
    LEFT OUTER JOIN \"postingPositions\" ON postings.\"postingId\"\
     = \"postingPositions\".\"postingId\"\n\
GROUP BY boolean.\"termId\"\n\
ORDER BY boolean.\"termId\" ASC\n";
        let queryResults = await sequelize.query(queryString);
        queryResults = queryResults[0];
        let result = [];
        for( let i = 0; i < queryResults.length; i++ ) {
            let queryResult = queryResults[i];
            result.push(queryResult.count);
        }
        return result;
    }

    /**
     * Get the set of words vector from the database for specified clean
     * content. Note: This is slow... Todo: Improve performance, however,
     * I do not see a good option yet
     * @param  {UUIDv4} cleanContentId The clean content id for which the SoW
     *                                 should be built
     * @return {Array.<number>}        Returns the SoW as JSON array, which can
     *                                 be interpreted as rudimentary vector.
     *                                 This representation is sufficient for the
     *                                 used SVM library
     */
    async function getSetOfWords(cleanContentId) {
        let queryString = "\
SELECT COUNT(postings.\"termTermId\")\n\
FROM\n\
    postings\n\
    RIGHT OUTER JOIN terms ON terms.\"termId\" = postings.\"termTermId\" AND \
    postings.\"cleanContentCleanContentId\" = \
    'ab294f59-c8ed-4f45-b4a6-dff6d6f109a2'\n\
GROUP BY terms.\"termId\"\n\
ORDER BY terms.\"termId\" ASC\n";
        let queryResults = await sequelize.query(queryString);
        queryResults = queryResults[0];
        let result = [];
        for( let i = 0; i < queryResults.length; i++ ) {
            let queryResult = queryResults[i];
            result.push(queryResult.count);
        }
        return result;
    }

    /**
     * Get randomized trainings data from the database
     * @param {number} limit Specifies how many entries should be returned
     * @param {number} quantile Specify "how certain" the entry must be in order
     *                          to be viable
     *                          Quantile is in the range of [0, 1]
     * @param {string} mode="bow" Specify whether you want a BoW (default) or a
     *                            SoW as result. {"bow", "sow"}
     * @return {Array.<Object>} Contains a cleanContent model and a bag of words
     *                          vector. The results are contained in the
     *                          cleanContent model already (legal&primaryLabel).
     *                          The words in the bag of word vector are always
     *                          sorted by id (faster than lexicographic sort
     *                          and in fact the sorting does not matter, as
     *                          long as it is always the same)
     */
    CleanContent.getTrainingData = async function( limit, quantile, mode ) {
        if (!mode) {
            mode = "bow";
        }
        let cleanContents = await CleanContent.findAll({
            where: Sequelize.where(
                Sequelize.literal("\"cleanContent\".\"legalCertainty\" +\
                \"cleanContent\".\"classCertainty\""),
                ">",
                quantile
            ),
            order: [
                [Sequelize.literal('random()')]
            ],
            limit: limit,
        });
        let results = [];
        for ( let i = 0; i < cleanContents.length; i++ ) {
            let cleanContent = cleanContents[i];
            let cleanContentId = cleanContent.cleanContentId;
            let wordVector;
            if (mode === "bow") {
                wordVector = await getBagOfWords(cleanContentId);
            } else if (mode === "sow") {
                wordVector = await getSetOfWords(cleanContentId);
            } else {
                console.error("mode " + mode + " unknown");
                console.error(
                    "Supported modes: bow (\"Bag of Words\") or sow\
                    (\"Set of Words\")"
                );
                throw new Error("mode " + mode + " not supported");
            }
            results.push({
                model: cleanContent,
                wordVec: wordVector,
            });
        }
        return results;
        /* eslint-enable no-multi-str */
    };

    /**
     * Get data to apply the model on
     * @param  {number} limit    The number of entries that should be retrieved
     *                           from the database
     * @param {string} model="bow" Specify whether you want a BoW (default) or a
     *                             SoW as result. {"bow", "sow"}
     * @return {Array.<Object>}  Contains a cleanContent model and a bag of
     *                           words vector. The words in the bag of word
     *                           vector are always sorted alphabetically
     */
    CleanContent.getLabellingData = async function( limit, model ) {
        return await CleanContent.getTrainingData(limit, 0, model);
    };

    return CleanContent;
};

"use strict";
let Sequelize = require("sequelize");
// Note: named mathjs to try reduce Math/mathjs confusion -- Those are NOT
// the same.
const mathjs = require("mathjs");

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
        labelCertainty: {
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
     * @param {number} dfCutoff        The cutoff value for how in how many
     *                                 docs a term must occure to be considered.
     *                                 This is useful, since we need to reduce
     *                                 the dimensionality of the vector as well
     *                                 as rare terms are mostly misleading.
     *                                 Further we try to avoid overfitting with
     *                                 such an approach.
     * @return {Array.<number>}        Returns the BoW as JSON array, which can
     *                                 be interpreted as rudimentary vector.
     *                                 This representation is sufficient for the
     *                                 used SVM library
     */
    async function getBagOfWords(cleanContentId, dfCutoff) {
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
             = '" + cleanContentId + "'\n\
        WHERE terms.\"documentFrequency\" > " + dfCutoff + " \n\
        GROUP BY terms.\"termId\"\n\
    ) boolean\n\
    LEFT OUTER JOIN postings ON postings.\"termTermId\" = boolean.\"termId\"\
     AND postings.\"cleanContentCleanContentId\" =\
      '" + cleanContentId + "'\n\
    LEFT OUTER JOIN \"postingPositions\" ON postings.\"postingId\"\
     = \"postingPositions\".\"postingId\"\n\
GROUP BY boolean.\"termId\"\n\
ORDER BY boolean.\"termId\" ASC\n";
        let queryResults = await sequelize.query(queryString);
        queryResults = queryResults[0];
        let result = [];
        for ( let i = 0; i < queryResults.length; i++ ) {
            let queryResult = queryResults[i];
            result.push(queryResult.count);
        }
        // Now we can normalize the result before returning:
        // a) center mean around 0
        // b) divide by std => std(result) = 1
        let mean = mathjs.mean(result);
        let std = mathjs.std(result);
        result = result.map((elem) => {
            return (elem - mean) / std;
        });
        return result;
    }

    /**
     * Get the set of words vector from the database for specified clean
     * content. Note: This is slow... Todo: Improve performance, however,
     * I do not see a good option yet
     * @param  {UUIDv4} cleanContentId The clean content id for which the SoW
     *                                 should be built
     * @param {number} dfCutoff        The cutoff value for how in how many
     *                                 docs a term must occure to be considered.
     *                                 This is useful, since we need to reduce
     *                                 the dimensionality of the vector as well
     *                                 as rare terms are mostly misleading.
     *                                 Further we try to avoid overfitting with
     *                                 such an approach.
     * @return {Array.<number>}        Returns the SoW as JSON array, which can
     *                                 be interpreted as rudimentary vector.
     *                                 This representation is sufficient for the
     *                                 used SVM library
     */
    async function getSetOfWords(cleanContentId, dfCutoff) {
        let queryString = "\
SELECT COUNT(postings.\"termTermId\")\n\
FROM\n\
    postings\n\
    RIGHT OUTER JOIN terms ON terms.\"termId\" = postings.\"termTermId\" AND \
    postings.\"cleanContentCleanContentId\" = \
'" + cleanContentId + "'\n\
WHERE terms.\"documentFrequency\" > " + dfCutoff + "\n\
GROUP BY terms.\"termId\"\n\
ORDER BY terms.\"termId\" ASC\n";
        let queryResults = await sequelize.query(queryString);
        queryResults = queryResults[0];
        let result = [];
        for ( let i = 0; i < queryResults.length; i++ ) {
            let queryResult = queryResults[i];
            result.push(queryResult.count);
        }
        // Now we can normalize the result before returning:
        // a) center mean around 0
        // b) divide by std => std(result) = 1
        let mean = mathjs.mean(result);
        let std = mathjs.std(result);
        result = result.map((elem) => {
            return (elem - mean) / std;
        });
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
     * @param {number} dfQuantile Acts as a cutoff value and bounds the df from
     *                            below. This ensures that very rare terms are
     *                            not represented in the result vectors. This is
     *                            important in different ways. Once to not
     *                            overfit during training (e.g. if a NN is used)
     *                            and for the other to reduce dimensionality
     *                            with words that are not learnable for our
     *                            system (e.g. a word that only appears in one
     *                            document).
     * @param {Array.<String>} languageIds LanguageId to specify which languages
     *                                     should be contained in the training
     *                                     set. If the param is undefined, all
     *                                     languages are returned.
     * @return {Array.<Object>} Contains a cleanContent model and a bag of words
     *                          vector. The results are contained in the
     *                          cleanContent model already (legal&primaryLabel).
     *                          The words in the bag of word vector are always
     *                          sorted by id (faster than lexicographic sort
     *                          and in fact the sorting does not matter, as
     *                          long as it is always the same)
     */
    CleanContent.getTrainingData = async function(
        limit,
        quantile,
        mode,
        dfQuantile,
        languageIds
    ) {
        /**
         * Print progress updates to stdout
         * @param  {number} percentage The percentage to use
         */
        function printProgress(percentage) {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write(
                "[Gathering data] Progress: " + percentage + "%"
            );
        }
        if (!mode) {
            mode = "bow";
        }
        // Calculating in how many docs a term has to appear to be over
        // the dfQuantile threshold
        let cleanContentsCount = await CleanContent.count();
        let dfCutoff = cleanContentsCount * dfQuantile;

        let where = Sequelize.where(
            Sequelize.literal("\"cleanContent\".\"legalCertainty\" +\
            \"cleanContent\".\"labelCertainty\""),
            ">",
            quantile
        );
        if (languageIds) {
            where = Sequelize.where(
                Sequelize.literal("\"cleanContent\".\"legalCertainty\" +\
                \"cleanContent\".\"labelCertainty\""),
                ">",
                quantile,
                "AND",
                "\"cleanContent\".\"languageLanguageId\"",
                "IN",
                languageIds
            );
        }


        // get cleanContents for which we calculate the bow/sow
        let cleanContents = await CleanContent.findAll({
            where: where,
            order: [
                [Sequelize.literal("random()")],
            ],
            limit: limit,
        });
        let results = [];
        // TODO: Split up cleanContents to #processes shards, then run the
        // loop in each of them, join the results afterwards
        // So:
        // 1. Fork here #process child processes, +1 supervisor (parent) process
        // 2. Instantiate message handler to receive the result
        //    => Merge results into final result list
        // 3. Instantiate exit handler to receive when a child died or finished
        //    (Can be distinguished by the parameters passed and whether we have
        //    a result or not)
        let percentage = 0;
        let percentPerContent = 100./cleanContents.length;
        for ( let i = 0; i < cleanContents.length; i++ ) {
            let cleanContent = cleanContents[i];
            let cleanContentId = cleanContent.cleanContentId;
            let wordVector;
            if (mode === "bow") {
                wordVector = await getBagOfWords(cleanContentId, dfCutoff);
            } else if (mode === "sow") {
                wordVector = await getSetOfWords(cleanContentId, dfCutoff);
            } else {
                console.error("mode " + mode + " unknown");
                console.error(
                    "Supported modes: bow (\"Bag of Words\") or sow\
                    (\"Set of Words\")"
                );
                throw new Error("mode " + mode + " not supported");
            }
            if (i == 0) {
                console.log("Feature vector dimensions: " + wordVector.length);
            }
            results.push({
                model: cleanContent,
                wordVec: wordVector,
            });
            printProgress(percentage);
            percentage += percentPerContent;
        }
        // 4. Wait for all childs to finish/exit
        //    => Now return the finally merged result list
        return results;
        /* eslint-enable no-multi-str */
    };

    /**
     * Get data to apply the model on
     * @param  {number} limit     The number of entries that should be retrieved
     *                            from the database
     * @param {string} mode="bow" Specify whether you want a BoW (default) or a
     *                            SoW as result. {"bow", "sow"}
     * @param {number} dfQuantile Acts as a cutoff value and bounds the df from
     *                            below. This ensures that very rare terms are
     *                            not represented in the result vectors. This is
     *                            important in different ways. Once to not
     *                            overfit during training (e.g. if a NN is used)
     *                            and for the other to reduce dimensionality
     *                            with words that are not learnable for our
     *                            system (e.g. a word that only appears in one
     *                            document).
     * @param {Array.<String>} languageIds LanguageId to specify which languages
     *                                     should be contained in the training
     *                                     set. If the param is undefined, all
     *                                     languages are returned.
     * @return {Array.<Object>}   Contains a cleanContent model and a bag of
     *                            words vector. The words in the bag of word
     *                            vector are always sorted alphabetically
     */
    CleanContent.getLabellingData = async function(
        limit,
        mode,
        dfQuantile,
        languageIds
    ) {
        return await CleanContent.getTrainingData(
            limit,
            0,
            mode,
            dfQuantile,
            languageIds
        );
    };

    /**
     * Get all contents labelled empty and recalculate their terms and insert
     * it into the index - some of them seem to be empty
     * @param  {number} limit How many entries should be returned from the db
     * @param {Label} primaryLabel Specify the contents to be updated by primary
     *                             label
     * @param {Language} languageModel Injects the dependency to the language
     *                                 model, since we cannot require it at
     *                                 this point in time (may not yet be
     *                                 defined)
     * @param {number} offset How many entries were already processed and do not
     *                        need to be updated
     * @return {Array.<cleanContent>}       Returns an array of empty labelled
     *                                      cleanContent models.
     */
    CleanContent.getContentsForUpdate = async function(
        limit,
        primaryLabel,
        languageModel,
        offset
    ) {
        return await CleanContent.findAll({
            where: {
                primaryLabelLabelId: primaryLabel.labelId,
            },
            include: [{
                model: languageModel,
            }],
            limit: limit,
            offset: offset,
        });
    };

    return CleanContent;
};

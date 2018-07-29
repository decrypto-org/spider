"use strict";
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
     * Get randomized trainings data from the database
     * @param {number} limit Specifies how many entries should be returned
     * @param {number} quantile Discard any terms that appear in less than the
     *                          specified percentage of all entries.
     *                          Quantile is in the range of [0, 1]
     * @return {Array.<Object>} Contains a cleanContent model, a bag of words
     *                          vector and the label (id) of the content.
     *                          The words in the bag of word vector are always
     *                          sorted alphabetically
     */
    CleanContent.getTrainingData = async function( limit, quantile ) {
        return {};
    };

    /**
     * Get data to apply the model on
     * @param  {number} limit    The number of entries that should be retrieved
     *                           from the database
     * @param  {number} quantile Ideally should match the quantile used for
     *                           training the model. Describes which terms (
     *                           frequency) should be discarded.
     * @return {Array.<Object>}  Contains a cleanContent model and a bag of
     *                           words vector. The words in the bag of word
     *                           vector are always sorted alphabetically
     */
    CleanContent.getLabellingData = async function( limit, quantile ) {
        return {};
    };

    return CleanContent;
};

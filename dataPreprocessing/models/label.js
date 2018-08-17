"use strict";

module.exports = (sequelize, DataTypes) => {
    const Label = sequelize.define("label", {
        labelId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        label: {
            type: DataTypes.TEXT,
            unique: true,
        },
        numberOfDocs: {
            type: DataTypes.BIGINT,
            defaultValue: 1,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "label"},
                ],
            },
            {
                fields: [
                    {attribute: "numberOfDocs", sorted: "DESC"},
                    {attribute: "label"},
                ],
            },
        ],
        timestamps: true,
    });
    /**
     * Insert multiple labels into the label table. If the label already existed
     * the found model is returned.
     * @param  {Array.<Object>} labels All labels which should be inserted,
     *                                 each object consisting of a label and an
     *                                 id (keys: )
     * @param {Sequelize.Transaction} transaction Transaction to use for the
     *                                            update. If none is provided,
     *                                            a managed transaction is used
     * @return {Array.<object>}        An array of all created label models
     */
    Label.bulkUpsert = async function(labels, transaction) {
        /* eslint-disable no-multi-str */
        let labelInsertString = "\
INSERT INTO \"labels\"\n\
    (\n\
        \"labelId\",\n\
        \"label\"\n\
    )\n\
VALUES\n";
        let replacementsForLabelInsert = [];
        for ( let i = 0; i < labels.length; i++ ) {
            let label = labels[i].label;
            let value = "   (?, ?)";
            replacementsForLabelInsert.push(labels[i].id);
            replacementsForLabelInsert.push(label);
            if ( i == labels.length - 1 ) {
                value += "\n";
            } else {
                value += ",\n";
            }
            labelInsertString += value;
        }
        labelInsertString += "\
ON CONFLICT(\"label\")\n\
DO UPDATE SET \n\
    \"numberOfDocs\" = \"labels\".\"numberOfDocs\" + 1\n\
RETURNING \"labelId\", \"label\"";
        /* eslint-enable no-multi-str */
        if (!transaction) {
            return await sequelize.query(
                labelInsertString,
                {
                    replacements: replacementsForLabelInsert,
                    model: Label,
                }
            );
        }
        return await sequelize.query(
            labelInsertString,
            {
                replacements: replacementsForLabelInsert,
                model: Label,
                transaction: transaction,
            }
        );
    };
    return Label;
};

"use strict";
let uuidv4 = require("uuid/v4");

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
            defaultValue: 1
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
    });
    /**
     * Insert multiple labels into the label table. If the label already existed
     * the found model is returned.
     * @param  {Array.<string>} labels All labels which should be inserted
     * @return {Array.<object>}        An array of all created label models
     */
    Label.bulkUpsert = async function(labels) {
        let labelInsertString = "\
LOCK TABLE ONLY \"labels\" IN SHARE ROW EXCLUSIVE MODE;\n\
INSERT INTO \"labels\"\n\
    (\n\
        \"labelId\",\n\
        \"label\"\n\
    )\n\
VALUES\n";
        let replacementsForLabelInsert = [];
        for ( let i = 0; i < labels.length; i++ ) {
            let newLabelId = uuidv4();
            let label = labels[i];
            let value = "   (?, ?)";
            replacementsForLabelInsert.push(newLabelId);
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
        return await sequelize.query(
            labelInsertString,
            {
                replacements: replacementsForLabelInsert,
                model: Label
            }
        );
    };
    return Label;
};

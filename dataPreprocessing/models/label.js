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
        },
        numberOfDocs: {
            type: DataTypes.BIGINT,
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
    return Label;
};

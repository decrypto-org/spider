"use strict";
module.exports = (sequelize, DataTypes) => {
    const Language = sequelize.define("language", {
        languageId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        language: {
            type: DataTypes.STRING(3),
        },
        numberOfDocuments: {
            type: DataTypes.BIGINT,
            defaultValue: 0,
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "language", sorted: "ASC"},
                ],
            },
            {
                fields: [
                    {attribute: "numberOfDocuments", sorted: "DESC"},
                ],
            },
        ],
    });
    return Language;
};

"use strict";
module.exports = (sequelize, DataTypes) => {
    const language = sequelize.define("language", {
        languageId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        /* eslint-disable new-cap*/
        language: {
            type: DataTypes.STRING(3),
        },
        /* eslint-enable new-cap */
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
    return language;
};

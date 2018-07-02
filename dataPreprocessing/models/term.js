"use strict";
module.exports = (sequelize, DataTypes) => {
    const Term = sequelize.define("term", {
        termId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        term: {
            type: DataTypes.TEXT,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
        documentFrequency: {
            type: DataTypes.BIGINT,
            defaultValue: 0,
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "term", sorted: "ASC"},
                ],
            },
        ],
        timestamps: true,
    });
    Term.associate = function(models) {
        Term.belongsTo(models.invertedIndex, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };
    return Term;
};

"use strict";
module.exports = (sequelize, DataTypes) => {
    const Postings = sequelize.define("posting", {
        postingId: {
            type: DataTypes.UUID,
            primaryKey: true,
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "cleanContentCleanContentId"},
                    {attribute: "termTermId"},
                ],
            },
        ],
    });
    Postings.associate = function(models) {
        Postings.belongsTo(models.cleanContent, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        Postings.belongsTo(models.term, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        Postings.belongsToMany(models.position, {
            through: "postingPosition",
            foreignKey: "postingId",
        });
    };
    return Postings;
};

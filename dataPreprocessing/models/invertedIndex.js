"use strict";
module.exports = (sequelize, DataTypes) => {
    const InvertedIndex = sequelize.define("invertedIndex", {
        indexId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
    });
    InvertedIndex.associate = function(models) {
        InvertedIndex.hasMany(models.cleanContent, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        InvertedIndex.hasOne(models.term, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        InvertedIndex.hasMany(models.position, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };
    return InvertedIndex;
};

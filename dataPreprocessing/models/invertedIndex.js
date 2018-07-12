"use strict";
module.exports = (sequelize, DataTypes) => {
    const Postings = sequelize.define("postings", {
        postingId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
    });
    Postings.associate = function(models) {
        Postings.belongsToMany(models.cleanContent, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        Postings.hasOne(models.term, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        Postings.hasMany(models.position, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };
    return Postings;
};

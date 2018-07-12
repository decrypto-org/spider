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
        Postings.belongsToMany(models.position, {
            through: "postingPosition",
            foreignKey: "postingId",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };
    return Postings;
};

"use strict";
module.exports = (sequelize, DataTypes) => {
    const Position = sequelize.define("position", {
        positionId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        position: {
            type: DataTypes.BIGINT,
            defaultValue: 0,
        },
    });
    Position.associate = function(models) {
        Position.belongsToMany(models.postings,{
            through: "postingPosition",
            foreignKey: "positionId",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        })
    }
    return Position;
};

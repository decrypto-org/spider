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
        isTitle: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    });
    return Position;
};

/* global models */
module.exports = (sequelize, DataTypes) => {
    const Path = sequelize.define("paths", {
        pathId: {
            type: DataTypes.BIGINT,
            allowNull: false,
            unique: true,
            primaryKey: true,
            autoIncrement: true,
        },
        lastScrapedTimestamp: {
            type: DataTypes.BIGINT,
        },
        lastSuccessfulTimestamp: {
            type: DataTypes.BIGINT,
        },
        path: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
    });
    Path.hasMany(models.Content, {
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
        foreignKey: {
            name: "pathId",
            allowNull: false,
        },
    });
    return Path;
};

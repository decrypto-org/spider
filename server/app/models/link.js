/* global models */
module.exports = (sequelize, DataTypes) => {
    const Link = sequelize.define("link", {
        linkId: {
            type: DataTypes.BIGINT,
            allowNull: false,
            unique: true,
            primaryKey: true,
            autoIncrement: true,
        },
    });
    Link.belongsTo(models.Content, {
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
        foreignKey: {
            allowNull: false,
            name: "sourceContentId",
        },
    });
    Link.belongsTo(models.Content, {
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
        foreignKey: {
            allowNull: false,
            name: "destinationContentId",
        },
    });
    return Link;
};

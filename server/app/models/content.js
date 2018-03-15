module.exports = (sequelize, DataTypes) => {
    const Content = sequelize.define("content", {
        contentId: {
            type: DataTypes.BIGINT,
            allowNull: false,
            unique: true,
            autoIncrement: true,
            primaryKey: true,
        },
        scrapeTimestamp: {
            type: DataTypes.BIGING,
            allowNull: false,
        },
        content: {
            type: DataTypes.TEXT,
        },
        contentType: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        success: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
        },
    });
    return Content;
};

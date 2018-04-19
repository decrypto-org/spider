module.exports = (sequelize, DataTypes) => {
    const Content = sequelize.define("content", {
        contentId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        scrapeTimestamp: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        content: {
            type: DataTypes.TEXT,
        },
        contentType: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        statusCode: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
    });
    return Content;
};

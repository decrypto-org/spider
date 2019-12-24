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
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
        robots: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "contentId", order: "DESC"},
                ],
            },
            {
                unique: true,
                fields: [
                    {attribute: "pathPathId", order: "DESC"},
                ],
            },
        ],
    });
    return Content;
};

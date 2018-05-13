module.exports = (sequelize, DataTypes) => {
    // The numberOfHits field is updated every time we hit a baseUrl.
    // This enables us on one hand to always return all the IDs, even if they
    // already were stored, similar to the findOrCreate command offered by
    // sequelize. However, this way we can make a bulk inserts.
    // Further, we have a denormalized count of how many links point to this
    // path.
    const Path = sequelize.define("path", {
        pathId: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },
        lastStartedTimestamp: {
            type: DataTypes.BIGINT,
        },
        lastFinishedTimestamp: {
            type: DataTypes.BIGINT,
        },
        inProgress: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
        },
        lastSuccessfulTimestamp: {
            type: DataTypes.BIGINT,
        },
        depth: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        path: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        secure: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
        },
        random: {
            type: DataTypes.DOUBLE,
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
        numberOfHits: {
            type: DataTypes.BIGINT,
            defaultValue: 0,
        },
    },
    {
        indexes: [
            {
                fields: [
                    {attribute: "depth", order: "ASC"},
                    {attribute: "random", order: "ASC"},
                ],
            },
            {
                unique: true,
                fields: [
                    {attribute: "path"},
                    {attribute: "baseUrlBaseUrlId"},
                ],
            },
        ],
        timestamps: true,
    });
    Path.associate = function(models) {
        Path.hasMany(models.content, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        Path.belongsTo(models.baseUrl, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };
    return Path;
};

module.exports = (sequelize, DataTypes) => {
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
    },
    {
        indexes: [
            {
                fields: [
                    {attribute: "depth", order: "ASC"},
                    {attribute: "random", order: "ASC"}
                ],
            },
        ],
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

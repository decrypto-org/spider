module.exports = (sequelize, DataTypes) => {
    // The numberOfHits field is updated every time we hit a baseUrl.
    // This enables us on one hand to always return all the IDs, even if they
    // already were stored, similar to the findOrCreate command offered by
    // sequelize. However, this way we can make a bulk inserts.
    // Further, we have a denormalized count of how many links point to this
    // host.
    const BaseUrl = sequelize.define("baseUrl", {
        baseUrlId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        subDomain: {
            type: DataTypes.TEXT,
        },
        baseUrl: {
            type: DataTypes.TEXT,
            unique: true,
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
    });
    BaseUrl.associate = function(models) {
        BaseUrl.hasMany(models.path, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
            unique: "compositeIndex",
        });
    };
    return BaseUrl;
};

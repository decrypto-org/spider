module.exports = (sequelize, DataTypes) => {
    const BaseUrl = sequelize.define("baseUrl", {
        baseUrlId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        baseUrl: {
            type: DataTypes.TEXT,
            unique: true,
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

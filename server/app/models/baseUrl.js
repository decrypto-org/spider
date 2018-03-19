module.exports = (sequelize, DataTypes) => {
    const BaseUrl = sequelize.define("baseUrl", {
        baseUrlId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        baseUrl: DataTypes.TEXT,
    });
    BaseUrl.associate = function(models) {
        BaseUrl.hasMany(models.path, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };
    return BaseUrl;
};

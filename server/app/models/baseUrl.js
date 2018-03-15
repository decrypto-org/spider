/* global models */
module.exports = (sequelize, DataTypes) => {
    const BaseUrl = sequelize.define("baseUrl", {
        baseurlid: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
        },
        baseurl: DataTypes.TEXT,
    });
    // We have to deactiv
    BaseUrl.hasMany(models.Path, {
        foreignKey: {
            name: "baseUrlId",
            allowNull: false,
        },
    });
    return BaseUrl;
};

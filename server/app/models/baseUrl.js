module.exports = (sequelize, DataTypes) => {
	return sequelize.define("baseUrl", {
		baseurlid: DataTypes.BIGINT,
		baseurl: DataTypes.TEXT
	});
}
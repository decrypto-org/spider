"use strict";
module.exports = (sequelize, DataTypes) => {
	const PostingPosition = sequelize.define("postingPosition", {
		postingPositionId: {
			type: DataTypes.UUID,
			defaultValue: DataTypes.UUIDV4,
			primaryKey: true
		},
	});
	return PostingPosition;
}

"use strict";
module.exports = (sequelize, DataTypes) => {
    const CleanContent = sequelize.define("cleanContent", {
        cleanContentId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
    }, {

    });
    CleanContent.associate = function(models) {
        CleanContent.hasOne(models.language, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        CleanContent.hasOne(models.cleanContent, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        CleanContent.hasOne(models.label, {
            as: "PrimaryLabel",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };
    return CleanContent;
};

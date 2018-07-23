"use strict";
module.exports = (sequelize, DataTypes) => {
    const CleanContent = sequelize.define("cleanContent", {
        cleanContentId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        cleanContent: {
            type: DataTypes.TEXT,
            defaultValue: "",
        },
        rawContentId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        pathPathId: {
            type: DataTypes.UUID,
            allowNull: false,
        }
    }, {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "rawContentId", order: "DESC"},
                ],
            },
        ]
    });
    CleanContent.associate = function(models) {
        CleanContent.belongsTo(models.language, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
        CleanContent.belongsTo(models.label, {
            as: "primaryLabel",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };
    return CleanContent;
};

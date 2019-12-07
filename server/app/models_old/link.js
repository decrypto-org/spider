module.exports = (sequelize, DataTypes) => {
    const Link = sequelize.define("link", {
        linkId: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },
        timestamp: {
            type: DataTypes.BIGINT,
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
    },
    {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "destinationPathId"},
                    {attribute: "sourcePathId"},
                ],
            },
            {
                fields: [
                    {attribute: "sourcePathId", order: "DESC"},
                ],
            },
            {
                fields: [
                    {attribute: "destinationPathId", order: "DESC"},
                ],
            },
        ],
    });
    Link.associate = function(models) {
        Link.belongsTo(models.path, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
            foreignKey: {
                allowNull: false,
                name: "sourcePathId",
            },
        });
        Link.belongsTo(models.path, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
            foreignKey: {
                allowNull: false,
                name: "destinationPathId",
            },
        });
    };
    return Link;
};

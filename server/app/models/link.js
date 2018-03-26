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

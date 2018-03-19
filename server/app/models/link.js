module.exports = (sequelize, DataTypes) => {
    const Link = sequelize.define("link", {
        linkId: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },
    });
    Link.associate = function(models) {
        Link.belongsTo(models.content, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
            foreignKey: {
                allowNull: false,
                name: "sourceContentId",
            },
        });
        Link.belongsTo(models.content, {
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    };
    return Link;
};

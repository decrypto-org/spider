"use strict";
let uuidv4 = require("uuid/v4");

module.exports = (sequelize, DataTypes) => {
    const Position = sequelize.define("position", {
        positionId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        position: {
            type: DataTypes.BIGINT,
            defaultValue: 0,
            unique: true,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
    }, {
        timestamps: true,
    });
    Position.associate = function(models) {
        Position.belongsToMany(models.posting, {
            through: "postingPosition",
            foreignKey: "positionId",
        });
    };

    /**
     * Insert positions into the position table. If this position
     * was already used, update the modifiedAt timestamp and return
     * the position object of all (created or modified) entries.
     * @param  {Array.<number>} positions Array of positions to insert
     * @return {Promise}        Will be resolved with a list of position objects
     *                          or rejected with an error string.
     */
    Position.bulkUpsert = async function(positions) {
        /* eslint-disable no-multi-str */
        let positionInsertString = "\
LOCK TABLE ONLY \"positions\" IN SHARE ROW EXCLUSIVE MODE;\n\
INSERT INTO \"positions\"\n\
    (\n\
        \"positionId\",\n\
        \"position\"\n\
    )\n\
VALUES\n";
        let replacementsForPositions = [];
        for ( let i = 0; i < positions.length; i++ ) {
            let newPositionId = uuidv4();
            let position = positions[i];
            let value = "   (?, ?)";
            replacementsForPositions.push(newPositionId);
            replacementsForPositions.push(position);
            if ( i == positions.length - 1 ) {
                value += "\n";
            } else {
                value += ",\n";
            }
            positionInsertString += value;
        }
        positionInsertString += "\
ON CONFLICT(\"position\")\n\
DO UPDATE SET \n\
    \"updatedAt\" = NOW()\n\
RETURNING \"positionId\", \"position\"";
        return await sequelize.query(
            positionInsertString,
            {
                replacements: replacementsForPositions,
                model: Position,
            }
        );
    };

    return Position;
};

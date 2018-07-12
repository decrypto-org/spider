"use strict";
let uuidv4 = require("uuid/v4");

module.exports = (sequelize, DataTypes) => {
    const Term = sequelize.define("term", {
        termId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        term: {
            type: DataTypes.TEXT,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
        documentFrequency: {
            type: DataTypes.BIGINT,
            defaultValue: 0,
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "term", sorted: "ASC"},
                ],
            },
        ],
        timestamps: true,
    });
    Term.associate = function(models) {
        Term.belongsToMany(models.cleanContent, {
            through: "postings",
            foreignKey: "termId",
        });
    };

    /**
     * Insert a term into the terms table. If the term already existed,
     * increase the document counter.
     * @param  {string} terms Terms to be inserted into the table
     * @return {Promise}      The Promise will be resolved with a term-
     *                        term<Object> mapping and will be rejected with an
     *                        error message
     */
    Term.bulkUpsert = async function(terms) {
        /* eslint-disable no-multi-str */
        let termInsertString = "\
LOCK TABLE ONLY \"terms\" IN SHARE ROW EXCLUSIVE MODE;\n\
INSERT INTO \"terms\"\n\
    (\n\
        \"termId\",\n\
        \"term\"\n\
    )\n\
VALUES\n";
        let replacementsForTermInsertion = [];
        for (let i = 0; i < terms.length; i++) {
            let newTermId = uuidv4();
            let term = terms[i];
            let value = "   (?, ?)";
            replacementsForTermInsertion.push(newTermId);
            replacementsForTermInsertion.push(term);
            if ( i == terms.length -1 ) {
                value += "\n";
            } else {
                value += ",\n";
            }
            termInsertString += value;
        }
        termInsertString += "\
ON CONFLICT(\"term\")\n\
DO UPDATE SET \n\
    \"documentFrequency\" = \"terms\".\"documentFrequency\" + 1\n\
RETURNING \"termId\", \"term\"";
        let result = await sequelize.query(
            termInsertString,
            {
                replacements: replacementsForTermInsertion,
                model: Term,
            }
        );
        // We do not catch any exception here, since the client should deal
        // with this kind of error
        /* eslint-enable no-multi-str */
        let termTermMapping = {};
        for (let i = 0; i < result.length; i++) {
            let term = result[i];
            termTermMapping[term.term] = term;
        }
        return termTermMapping;
    };


    return Term;
};

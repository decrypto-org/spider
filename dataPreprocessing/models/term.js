"use strict";
let uuidv4 = require("uuid/v4");
let truncate = require("truncate-utf8-bytes");

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
        Term.hasMany(models.posting, {
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
        });
    };

    /**
     * Insert a term into the terms table. If the term already existed,
     * increase the document counter.
     * @param  {string} terms Terms to be inserted into the table
     * @param {Sequelize.Transaction} transaction If passed, this transaction
     *                                            will be used. If none is
     *                                            passed, a managed tranasaction
     *                                            will be used
     * @return {Promise}      The Promise will be resolved with an array of term
     *                        objects and will be rejected with an error message
     */
    Term.bulkUpsert = async function(terms, transaction) {
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
        for ( let i = 0; i < terms.length; i++ ) {
            let newTermId = uuidv4();
            let term = terms[i];
            let value = "   (?, ?)";
            if (Buffer.from(term).length >= 2711) {
                console.warn("Truncating too large term to 2500 bytes");
                console.warn("Postgres indexes uses a b tree");
                console.warn("The b tree supports only content of max 2710B");
                console.warn("Term was: " + term);
                term = truncate(term, 2500);
                console.warn("Term is now: " + term);
            }
            replacementsForTermInsertion.push(newTermId);
            replacementsForTermInsertion.push(term);
            if ( i == terms.length - 1 ) {
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
        if (!transaction) {
            return await sequelize.query(
                termInsertString,
                {
                    replacements: replacementsForTermInsertion,
                    model: Term,
                }
            );
        }
        return await sequelize.query(
            termInsertString,
            {
                replacements: replacementsForTermInsertion,
                model: Term,
                transaction: transaction,
            }
        );
    };
    return Term;
};

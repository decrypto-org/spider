module.exports = (sequelize, DataTypes) => {
    const Content = sequelize.define("content", {
        contentId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        scrapeTimestamp: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        content: {
            type: DataTypes.TEXT,
        },
        contentType: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        statusCode: {
            type: DataTypes.INTEGER,
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
    }, {
        indexes: [
            {
                unique: true,
                fields: [
                    {attribute: "contentId", order: "DESC"},
                ],
            },
            {
                unique: true,
                fields: [
                    {attribute: "pathPathId", order: "DESC"},
                ],
            },
        ],
    });
    /**
     * Get contents not yet preprocessed, one per not fully preprocessed
     * host, ordered lexicographically.
     * @param {number} limit You can give an upper limit in the number of
     *                       returned contents
     * @return {Promise} If resolved, it returns an array of conten object,
     *                   in order to preprocess them. If an error occurs, the
     *                   promise is rejected with an error message string
     */
    // Content.getContentsToProcess = async function(limit) {
    //     if (this.offset == undefined) {
    //         this.offset = 0;
    //     }

    //     let getContentsQueryString = ""
    //     let replacementsForContent = [];

    //     let result = [];
    //     let iterateLimit = limit;
    //     while(result.length < limit) {
    //         let tmpResult = await sequelize.query(
    //             getContentsQueryString,
    //             {
    //                 replacements: replacementsForContent,
    //                 model: Content
    //             }
    //         ).catch((err) => {
    //             // Let the user handle database errors
    //             return Promise.reject(err.message);
    //         });
    //         result.push(...tmpResult);
    //         if (tmpResult.length >= iterateLimit) {
    //             this.offset += tmpResult.length;
    //         } else {
    //             this.offset = 0;
    //             iterateLimit = iterateLimit - tmpResult.length;
    //         }
    //     }
    //     return result;
    // }
    return Content;
};

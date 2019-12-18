'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.createTable('users', { id: Sequelize.INTEGER });
    */
    return queryInterface.createTable("contents", {
        contentId: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
        },
        scrapeTimestamp: {
            type: Sequelize.BIGINT,
            allowNull: false,
        },
        content: {
            type: Sequelize.TEXT,
        },
        contentType: {
            type: Sequelize.TEXT,
            allowNull: false,
        },
        statusCode: {
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        createdAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal("NOW()"),
        },
        updatedAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal("NOW()"),
        },
      });
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable("contents");
  }
};

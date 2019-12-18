'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.createTable('users', { id: Sequelize.INTEGER });
    */
    return queryInterface.createTable("baseUrls",{
        baseUrlId: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
        },
        baseUrl: {
            type: Sequelize.TEXT,
        },
        createdAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal("NOW()"),
        },
        updatedAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal("NOW()"),
        },
        numberOfHits: {
            type: Sequelize.BIGINT,
            defaultValue: 0,
        },
    });
  },

  down: (queryInterface, Sequelize) => {
    /*
      Add reverting commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.dropTable('users');
    */
    return queryInterface.dropTable("baseUrls");
  }
};

'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.createTable('users', { id: Sequelize.INTEGER });
    */
    return queryInterface.createTable("links", {
        linkId: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
        },
        timestamp: {
            type: Sequelize.BIGINT,
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
    /*
      Add reverting commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.dropTable('users');
    */
    return queryInterface.dropTable("links");
  }
};

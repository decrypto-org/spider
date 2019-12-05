'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.createTable('users', { id: Sequelize.INTEGER });
    */
    return queryInterface.createTable("paths", {
        pathId: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.UUIDV4,
        },
        lastStartedTimestamp: {
            type: Sequelize.BIGINT,
        },
        lastFinishedTimestamp: {
            type: Sequelize.BIGINT,
        },
        inProgress: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
        },
        lastSuccessfulTimestamp: {
            type: Sequelize.BIGINT,
        },
        depth: {
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        path: {
            type: Sequelize.TEXT,
            allowNull: false,
        },
        subdomain: {
            type: Sequelize.TEXT,
        },
        secure: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
        },
        random: {
            type: Sequelize.DOUBLE,
            allowNull: false,
        },
        createdAt: {
            type: Sequelize.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
        updatedAt: {
            type: Sequelize.DATE,
            defaultValue: sequelize.literal("NOW()"),
        },
        numberOfHits: {
            type: Sequelize.BIGINT,
            defaultValue: 0,
        },
        numberOfDistinctHits: {
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
    return queryInterface.dropTable("paths");
  }
};

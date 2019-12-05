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
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        baseUrl: {
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
        numberOfHits: {
            type: DataTypes.BIGINT,
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

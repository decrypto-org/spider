'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.createTable('users', { id: Sequelize.INTEGER });
    */
    return queryInterface.addColumn(
      "paths",
      "baseUrlBaseUrlId",
      {
        type: Sequelize.UUID,
        references: {
          model: "baseUrls",
          key: "baseUrlId"
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      }
    );
  },

  down: (queryInterface, Sequelize) => {
    /*
      Add reverting commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.dropTable('users');
    */
    return queryInterface.removeColumn(
      "paths",
      "baseUrlBaseUrlId"
    );
  }
};

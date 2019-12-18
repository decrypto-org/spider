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
      "contents",
      "pathPathId",
      {
        type: Sequelize.UUID,
        references: {
          model: "paths",
          key: "pathId",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
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
      "contents",
      "pathPathId"
    );
  }
};

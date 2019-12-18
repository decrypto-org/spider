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
      "links",
      "sourcePathId",
      {
        type: Sequelize.UUID,
        references: {
          model: "paths",
          key: "pathId"
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
    ).then(() => queryInterface.addColumn(
      "links",
      "destinationPathId",
      {
        type: Sequelize.UUID,
        references: {
          model: "paths",
          key: "pathId",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      }
    ));
  },

  down: (queryInterface, Sequelize) => {
    /*
      Add reverting commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.dropTable('users');
    */
    return queryInterface.removeColumn(
      "links",
      "sourcePathId"
    ).then(() => queryInterface.removeColumn(
      "links",
      "destinationPathId"
    ));
  }
};

'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.createTable('users', { id: Sequelize.INTEGER });
    */
    return queryInterface.addIndex("links", {
        unique: true,
        fields: [
            {attribute: "destinationPathId"},
            {attribute: "sourcePathId"},
        ],
    }).then(() => queryInterface.addIndex("links", {
        fields: [
            {attribute: "sourcePathId", order: "DESC"},
        ],
    })).then(() => queryInterface.addIndex("links", {
        fields: [
            {attribute: "destinationPathId", order: "DESC"},
        ],
    }));
  },

  down: (queryInterface, Sequelize) => {
    /*
      Add reverting commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.dropTable('users');
    */
    return queryInterface.removeIndex("links", ["destinationPathId", "sourcePathId"])
    .then(() => queryInterface.removeIndex("links", ["sourcePathId"]))
    .then(() => queryInterface.removeIndex("links", ["destinationPathId"]));
  }
};

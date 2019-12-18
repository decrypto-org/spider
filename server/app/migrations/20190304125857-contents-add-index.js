'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.createTable('users', { id: Sequelize.INTEGER });
    */
    return queryInterface.addIndex("contents", {
        unique: true,
        fields: [
            {attribute: "contentId", order: "DESC"},
        ],
    }).then(() => queryInterface.addIndex("contents", {
        unique: true,
        fields: [
            {attribute: "pathPathId", order: "DESC"},
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
    return queryInterface.removeIndex("contents", ["contentId"])
    .then(() => queryInterface.removeIndex("contents", ["pathPathId"]));
  }
};

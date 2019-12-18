'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.createTable('users', { id: Sequelize.INTEGER });
    */
    return queryInterface.addIndex("paths", {
        fields: [
            {attribute: "depth", order: "ASC"},
            {attribute: "random", order: "ASC"},
        ],
    }).then(() => queryInterface.addIndex("paths", {
        fields: [
            {attribute: "lastFinishedTimestamp", order: "ASC"},
        ],
    })).then(() => queryInterface.addIndex("paths", {
        fields: [
            {attribute: "pathId", order: "DESC"},
        ],
    })).then(() => queryInterface.addIndex("paths", {
        unique: true,
        fields: [
            {attribute: "baseUrlBaseUrlId"},
            {attribute: "path"},
            {attribute: "subdomain"},
        ],
    })).then(() => queryInterface.addIndex("paths", {
        fields: [
            {attribute: "baseUrlBaseUrlId", order: "ASC"},
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
    return queryInterface.removeIndex("paths", ["depth", "random"])
    .then(() => queryInterface.removeIndex("paths", ["lastFinishedTimestamp"]))
    .then(() => queryInterface.removeIndex("paths", ["pathId"]))
    .then(() => queryInterface.removeIndex("paths", ["baseUrlBaseUrlId", "path", "subdomain"]))
    .then(() => queryInterface.removeIndex("paths", ["baseUrlBaseUrlId"]));
  }
};

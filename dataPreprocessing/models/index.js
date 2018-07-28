"use strict";
let fs = require("fs");
let path = require("path");
let Sequelize = require("sequelize");
let basename = path.basename(__filename);

let db = {};

/**
 * Passing logger.silly directly to sequelize results in a TypeError (since
 * the logger seems to be uninitialized at some point). This wrapper function
 * was suggested as workaround.
 * @param {Object} value - Contains the actual value that should be logged to
 *                         the transports.
 */
function logForSequelize(value) {
    // Ignore DB log for now - this only logs the sql queries that were made
    // console.log(value);
    return;
}

let sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: "postgres",
        pool: {
            max: process.env.PREPROCESSOR_MAX_DB_CONNECTIONS,
            min: process.env.DB_MIN_CONNECTIONS,
            idle: 60000,
            acquire: 120000,
        },
        operatorsAliases: false,
        logging: logForSequelize,
    },
);

fs
    .readdirSync(__dirname)
    .filter((file) => {
        return (file.indexOf(".") !== 0) &&
            (file !== basename) &&
            file.slice(-3) === ".js";
    })
    .forEach((file) => {
        let model = sequelize["import"](path.join(__dirname, file));
        db[model.name] = model;
    });

Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

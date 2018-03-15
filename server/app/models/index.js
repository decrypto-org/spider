let fs = require("fs");
let path = require("path");
let Sequelize = require("sequelize");
let basename = path.basename(__filename);

let db = {};

let sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: "postgres",
        pool: {
            max: process.env.DB_MAX_CONNECTIONS,
            min: process.env.DB_MIN_CONNECTIONS,
        },
        operatorsAliases: false,
    }
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

const winston = require("winston");
const {createLogger, format, transports} = winston;
const {combine, timestamp, printf, prettyPrint} = format;
// Initialize logger

const loggerFormat = printf((info) => {
    return `[${info.timestamp}] ${info.level}: ${info.message}`;
});

let logger = createLogger({
    level: "silly",
    format: combine(
        timestamp(),
        loggerFormat,
        prettyPrint()
    ),
    transports: [
        new transports.File({
            tailable: true,
            filename: process.env.LOG_LOCATION + "/spider.err",
            level: "error",
        }),
        new transports.File({
            tailable: true,
            filename: process.env.LOG_LOCATION + "/spider.log",
            level: process.env.LOG_LEVEL,
        }),
    ],
});

if (process.env.DEBUG == "true") {
    logger.add(
        new transports.Console({
            format: combine(
                timestamp(),
                loggerFormat
            ),
            level: process.env.DEBUG_LOG_LEVEL,
            colorize: true,
        })
    );
}

// This logger is specially written for the database connections/sequelize
const sequelizeLogLevels = {
    levels: {
        dbError: 0,
        dbWarn: 1,
        dbInfo: 2,
        dbVerbose: 3,
        dbDebug: 4,
        dbSilly: 5,
    },
    colors: {
        dbError: "red",
        dbWarn: "orange",
        dbInfo: "yellow",
        dbVerbose: "blue",
        dbDebug: "green",
        dbSilly: "white",
    },
};

winston.addColors(sequelizeLogLevels.colors);

/* eslint-disable no-unused-vars */
const dbLogger = createLogger({
    levels: sequelizeLogLevels.levels,
    level: "dbSilly",
    format: combine(
        timestamp(),
        prettyPrint()
    ),
    transports: [
        new transports.File({
            tailable: true,
            filename: process.env.LOG_LOCATION + "/sequelize.log",
            level: "dbSilly",
        }),
    ],
});

exports.dbLogger = dbLogger;
/* eslint-enable no-unused-vars */
exports.logger = logger;

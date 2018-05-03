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
            level: "debug",
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
            level: process.env.LOG_LEVEL,
            colorize: true,
        })
    );
}

exports.logger = logger;

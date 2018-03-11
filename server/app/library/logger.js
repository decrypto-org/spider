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
            filename: "/log/spider.err",
            level: "error",
        }),
        new transports.File({
            filename: "/log/spider.log",
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
            level: "silly",
            colorize: true,
        })
    );
}

exports.logger = logger;

const winston = require("winston");
const { createLogger, format, transports } = winston;
const { combine, timestamp, label, printf, prettyPrint } = format;
// Initialize logger
winston.remove(winston.transports.Console);

const logger_format = printf(info => {
	return `[${info.timestamp}] ${info.level}: ${info.message}`;
});

var logger = createLogger({
	level: "silly",
	format: combine(
		timestamp(),
		logger_format,
		prettyPrint()
	),
	transports:[
		new transports.File({
			filename: "/log/spider.err",
			level: "error"
		}),
		new transports.File({
			filename: "/log/spider.log"
		})
	]
});

if(process.env.DEBUG == "true"){
	logger.add(
		new transports.Console({
			format: combine(
				timestamp(),
				logger_format
			),
			level: "silly",
			colorize: true
		})
	);
}

exports.logger = logger;

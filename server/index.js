let fs = require("fs");
let path = require("path");
let csvjson = require("csvjson");
let dotenv = require("dotenv");
let variableExpansion = require("dotenv-expand");
let commandLineArgs = require("command-line-args");

/* eslint-disable no-unused-vars */
let spiderEnv = dotenv.config();
spiderEnv = variableExpansion(spiderEnv);
/* eslint-enable no-unused-vars */

// Requires the .env to be already loaded
let {logger} = require("./app/library/logger");

// Read in command line arguments (if any)
const commandLineOptions = commandLineArgs([
    {name: "init_urls_file", alias: "i", type: String, defaultOption: true},
    {name: "depth", alias: "d", type: Number},
    {name: "attach", alias: "a", type: Boolean},
]);

process.on("uncaughtException", (err) => {
    logger.error("UNCAUGHT EXCEPTION!");
    logger.error((err && err.stack) ? err.stack : err);
});

const main = require("./app/index");
logger.info("Loaded app/index");

// If the command line args specified a init file, we pass it to the spider
let pathToUrls = "";
let startUrls = [];
if (commandLineOptions.init_urls_file &&
    !path.isAbsolute(commandLineOptions.init_urls_file)) {
    pathToUrls = path.join(__dirname, commandLineOptions.init_urls_file);
    pathToUrls = path.normalize(pathToUrls);
} else if (commandLineOptions.init_urls_file) {
    pathToUrls = path.normalize(commandLineOptions.init_urls_file);
} else {
    startUrls = [["msydqstlz2kzerdg.onion"]];
}
if (pathToUrls != "") {
    let csvData = fs.readFileSync(
        pathToUrls,
        {encoding: "utf8"}
    );

    let csvOptions = {
        delimiter: ",",
        quote: "\"",
    };

    // Todo: Sanitize the data
    startUrls = csvjson.toArray(csvData, csvOptions);
    logger.info("Start urls: ", startUrls);
}

// Default of depth equals
// First: To command line arg (Overrides any other settings)
// Second: To Environment Var (defined by the .env file)
// Third: To 1 (if nothing is specified)
let depth = 1;
if (commandLineOptions.depth) {
    depth = commandLineOptions.depth;
} else if (process.env.SEARCH_DEPTH != "") {
    depth = parseInt(process.env.SEARCH_DEPTH);
}
let attach = false;
if (commandLineOptions.attach != undefined) {
    attach = commandLineOptions.attach;
} else if (process.env.ATTACH != "") {
    attach = process.env.ATTACH === "true";
}

logger.info("Starting spider");
main.init(startUrls, depth, attach);

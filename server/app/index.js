let {logger} = require("./library/logger");
const Conductor = require("./conductor");
require("./extensions/Set");

exports.init = async function(initUrls=[], depth=1) {
    let conductor = new Conductor(initUrls, depth, 9050);
    conductor.run();
};

process.on("exit", (code) => {
    logger.info("Spider shutdown");
    if (code != 0) {
        logger.info("An error occured. Please have a look at the logs");
        return;
    }
});

let {logger} = require("./library/logger");
const Conductor = require("./conductor");
let portscanner = require("portscanner");
let cluster = require("cluster");
let numCPUs = require("os").cpus().length;
require("./extensions/Set");

exports.init = async function(initUrls=[], depth=1) {
    if (cluster.isMaster) {
        logger.info("Master is living - forking");

        for (let i = 0; i < numCPUs; i++){
            cluster.fork();
        }

        cluster.on("exit", (worker, code, signal) => {
            logger.warn("Worker " + worker.process.pid + " died");
            if (code != 0 ){
                logger.error("Worker crashed");
                logger.info("Restarting worker");
                cluster.fork();
            }
        });
    } else {
        logger.info("Worker " + process.pid + " started");
        
        let conductor = new Conductor(initUrls, depth, 9000);
        conductor.run();
    }
    // portscanner.findAPortNotInUse(9000, 9100, "127.0.0.1", (error, port) => {
    //     if (error) {
    //         logger.error("An error occured while finding an unused port");
    //         process.exit(1);
    //     }
    // });
};

process.on("exit", (code) => {
    logger.info("Spider shutdown");
    if (code != 0) {
        logger.info("An error occured. Please have a look at the logs");
        return;
    }
});

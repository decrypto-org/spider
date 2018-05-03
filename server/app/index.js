let {logger} = require("./library/logger");
const Conductor = require("./conductor");
const Network = require("./network");
require("./extensions/Set");

// const portscanner = require("portscanner");

/**
 * User portscanner to get a free ports for Tor network connections. This
 * function returns a promise and wraps the callback based implementation
 * of portscanner.
 * @param {number} basePort - Lowest port from where should be searched
 * @param {number} endPort - Highest port (up to) which will be searched
 * @return {number} Return a port
 */
// function getPort(basePort, endPort) {
//     return new Promise((resolve, reject) => {
//         portscanner.findAPortNotInUse(
//             basePort,
//             endPort,
//             "127.0.0.1",
//             (error, torPort) => {
//                 if (error) {
//                     logger.error(
//                         "No open ports found.\n" +
//                         "Check if other instances are running and kill them."
//                         , error
//                     );
//                     reject("No open port in given range found");
//                 }
//                 resolve(torPort);
//             }
//         );
//     });
// }

exports.init = async function(initUrls=[], depth=1) {
    // Find available port to run tor on.
    // Since we spin up several TOR instances before launching the
    // Spider, we do not have to check if the ports are available.
    // They are not, since they are used by our Tor instances.
    let ports = [];
    for (
        let i = Network.BASE_PORT;
        i < Network.BASE_PORT + Network.MAX_SLOTS;
        i++
    ) {
        ports.push(i);
    }
    // let failCount = 0;
    // while (ports.length < Network.MAX_SLOTS) {
    //     let port = await getPort(
    //         8900 + ports.length + failCount, /* basePort */
    //         8900 + ports.length + Network.MAX_SLOTX /* endPort */
    //     ).catch((reason) => {
    //         failCount++;
    //     });

    //     ports.push(port);

    //     if (failCount > Network.MAX_SLOTS) {
    //         logger.error("Cannot find enough ports to run the scraper on.");
    //         logger.error("Try again with less concurrent network slots" +
    //             "or free up ports before trying again.");
    //         process.exit(1);
    //     }
    // }
    // If only a few of the identified ports are already taken, this results
    // in less concurrent connections. HOWEVER: If all were taken, this
    // results in the termination of the spider after the timeouts
    let conductor = new Conductor(initUrls, depth, ports);
    conductor.run();
};

process.on("exit", (code) => {
    logger.info("Spider shutdown");
    if (code != 0) {
        logger.info("An error occured. Please have a look at the logs");
        return;
    }
});

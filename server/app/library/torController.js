let {logger} = require("./logger");
let rpc = require("jrpc2");
let net = require("net");

module.exports.buildTorController = async function(socksPort) {
    return new Promise( (resolve, reject) => {
        this.host = process.env.TOR_HOST || "localhost";
        this.torPort = process.env.TOR_CONTROL_PORT || 9077;
        let client = net.createConnection(this.torPort, this.host, () => {
            let torController = new TorController(socksPort, client);
            resolve(torController);
        });
    });
}

/**
 * TorController gives us control access to the tor-router, who manages
 * the Tor instance for us. We use this to create, destroy or update instances
 * in order to mitigate issues with overloads.
 * TorController is a wrapper class, which exposes the tor-routers
 * RPCs as local methods. The used rpc lib typically uses callbacks,
 * which is not conceptually equivalent to a RPC. However, we wrapped those
 * calls and the methods now return a Promise. If one calls await for every
 * request, we are pretty close to what a conceptual RPC looks like.
 */
class TorController {

    constructor(socksPort, torControllerClient) {
        this.socksPort = socksPort; 
        this.client = torControllerClient;
    }

    /**
     * Create a Tor pool. This initializes the pool itself.
     * @return {Promise} Resolved on successful execution on the tor-router.
     */
    async createTorPool() {
        var createTorRequest = {
            "method": "createTorPool",
            "params": [],
            "jsonrpc": "2.0",
            "id": 1
        };
        this.client.write(JSON.stringify(createTorRequest));
        return new Promise( (resolve, reject) => {
            this.client.on("data", (chunk) => {
                var rawResponse = chunk.toString("utf8");
                var rpcResponse = JSON.parse( rawResponse );
                if (rpcResponse.id === 1) {
                    resolve(rpcResponse);
                }
            });
        });
    }

    /**
     * Create a SOCKS Server which is used for the Tor instances to connect
     * to the Tor network.
     * @param  {number} socksPort=9050 - Specify on which port the Tor instances 
     *                                   should run. Overrides the port
     *                                   specified at construction time
     * @return {Promise}               Resolved on successful creation of a
     *                                 SOCKS Server.
     */
    async createSocksServer(socksPort) {
        // Set torPort to 9050 (Tor standard), if undefined
        if (socksPort)  {
            this.socksPort = socksPort;
        }
        if (!this.socksPort){
            this.socksPort = 9050;
        }
        return new Promise( (resolve, reject) => {
            this.client.invoke(
                "createSOCKSServer",
                [torPort],
                (err, raw) => {
                    if (err) {
                        reject(new Error(err));
                    }
                    resolve(raw);
                }
            );
        });
    }

    /**
     * Create the specified number of Tor instances on the tor-router.
     * @param  {number} numOfInstances - The number of instances to create
     * @return {Promise}                The returned promise is resolved on
     *                                  a successful execution of the command
     *                                  on the control server. If the command
     *                                  fails, the Promise will be rejected.
     */
    async createTorInstances(numOfInstances) {
        return new Promise( (resolve, reject) => {
            this.client.invoke(
                "createInstances",
                [numOfInstances],
                (err, raw) => {
                    if(err) {
                        reject(new Error(err));
                    }
                    resolve(raw);
                }
            );
        });
    }

    /**
     * Close all available Tor instances.
     * @return {Promise} Resolved on successful execution of the close command
     *                   on the server.
     */
    async closeTorInstances() {
        return new Promise( (resolve, reject) => {
            this.client.invoke(
                "closeInstances",
                [],
                (err, raw) => {
                    if(err){
                        reject(new Error(err));
                    }
                    resolve(raw);
                }
            );
        });
    }
}

module.exports.TorController = TorController;

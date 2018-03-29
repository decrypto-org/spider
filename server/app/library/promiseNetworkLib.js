
/**
 * A simple http(s) based networking class, wraps the native lib to support
 * promised based handling.
 */
module.exports = class promiseNetwork {
    /**
     * Instantiate the new object with the settings object used to make a
     * request. This corresponds to the nodejs specification under
     * https://nodejs.org/api/http.html#http_http_request_options_callback
     * @param {object} settingsObj - Settings object according to nodejs docu.
     */
    constructor(settingsObj) {
        this.settingsObj = settingsObj;
    }

    /**
     * Initiate the request specified by the settings object.
     * @param {boolean} secure - Indicate whether to use http or https.
     * @return {Promise} Returns a promise object, resolves to a response object
     */
    get(secure) {
        let lib = null;
        if (secure) {
            lib = require("https");
        } else {
            lib = require("http");
        }
        return new Promise((resolve, reject) => {
            let request = lib.get(this.settingsObj, (response) => {
                resolve(response);
            });
            request.on("error", (err) => reject(err));
        });
    }
};

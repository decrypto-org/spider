// let {logger} = require("./library/logger");


/**
 * This module handels the parsing of the responses. This
 * is necessary to extract the information needed to keep the
 * Spider running and in the future extract information for
 * classification.
 * For now this only covers the regex based extraction. Other methods
 * as rendering, then taking the capture or similar could be implemented
 * in this module.
 */
class Parser {
    /**
     * Initialize the parser
     */
    constructor() {
        // "Subdomains" are not common on the darknet, however, there exist
        // examples, that make use of "subdomains",
        // e.g. whatever.bitmailendavkbec.onion. Therefor we match them as well
        // and I suggest treating them as any other base url as well.
        // Should match any .onion/possibly/lot/of/path?with=some&arguments=true
        // We are matching as broad as possible.
        /* eslint-disable max-len */
        this.onionRegexMatch = new RegExp(
            "(http(s)?://)?(www.)?([-a-zA-Z0-9@:%._+~#=]{2,256}.[oniONI]{5})/?([-a-zA-Z0-9@:%_+.~#?&//=]*)",
            "g"
        );
        /* eslint-enable max-len */
    }

    /**
     * @typedef ParseResult
     * @type{object}
     * @property {string} fullUrl - The full url, no splits. Mostly useful for
     *                              logging or display.
     * @property {boolean} http - Indicates the usage of http in the url string.
     * @property {boolean} secure - Indicates whether https (true) was used or
     *                              not (false).
     * @property {boolean} www - Indicates whether the URL contains www (true)
     *                           or not (false).
     * @property {string} baseUrl - The base url, including any possible http,
     *                              https, www or subdomains.
     * @property {string} path - The path, including any parameters or hooks.
     */

    /**
     * Extract all .onion URI within the string
     * @param {string} contentString - String (typically a HTML or JSON) from
     *                                 which .onion uris should be extracted.
     * @return {ParseResult[]} A list of matched .onion urls and possible
                          subdomains as well as the paths and possible arguments
                          (which are counted towards the path in this case)
     */
    extractOnionURI(contentString) {
        // Those are the groups that get matche, compare to above regexp
        // group1: The whole url
        // group2: http or https
        // group3: indicates whether http or https (by s) was used
        // group4: Would match any www.
        // group5: Base url
        // group6: Path
        let results = [];
        let m;
        do {
            let m = this.onionRegexMatch.exec(contentString);
            if (m) {
                /** @type{ParseResult} */
                let result = {
                    fullUrl: m[0],
                    http: m[1] != null,
                    secure: m[2] != null,
                    www: m[3] != null,
                    baseUrl: m[4],
                    path: m[5],
                };
                results.push(result);
            }
        } while (m);
        return results;
    }
}

module.exports = Parser;

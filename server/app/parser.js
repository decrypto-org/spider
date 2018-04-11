// Note: We disable the unusedvar check, since the logger is always helpful
/* eslint-disable no-unused-vars */
let {logger} = require("./library/logger");
/* eslint-enable no-unused-vars */
let cheerio = require("cheerio");

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
        /* eslint-disable max-len, no-useless-escape */
        this.onionRegexMatch = new RegExp(
            "(http(s)?://)?(www.)?((?:(?:[-a-zA-Z0-9@:%_+~#=][.]){0,241}[-a-zA-Z0-9=]{15,256})[.]onion(?::[0-9]{1,5})?)((?:/[-a-zA-Z0-9@:%_+.~#?&//=]*|$)?)?",
            "gi"
        );
        this.relativeUrlRegexMatch = new RegExp(
            /\s*href\s*=\s*(\"([/?][^"]*)\"|\'([/?][^']*)\'|[^'">\s]+)/gi
        );

        this.base64Regex = new RegExp(
            /\s*data:([a-z]+\/[a-z]+(;[a-z\-]+\=[a-z\-]+)?)?(;base64)?,[a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*/
        );
        /* eslint-enable max-len, no-useless-escape */
    }

    /**
     * This RegEx can be used to match or test strings if they contain base64
     * encoded data. Credits to @bgrins (GitHub)
     * Direct Link: https://gist.github.com/bgrins/6194623
     * @param {string} stringToTest - This string will be tested against the
     *                                regex.
     * @return {boolean} The return value indicates whether the passed string
     *                   contained any base64 data (true) or not (false).
     */
    matchBase64Media(stringToTest) {
        let result = this.base64Regex.test(stringToTest);
        if (result) {
            logger.info("Discarding " + stringToTest);
        }
        return result;
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
     * @param {DbResult} fromEntry - In order to construct the full URL from
     *                           relative URLS, we need to pass in the current
     *                           db entry, where the content was fetched for.
     * @param {boolean} isHtmlString=true - Indicate if input is an html string.
     *                                      Used for initialization and if
     *                                      later on more mime types can be used
     *                                      it will be extended to cover this.
     * @return {ParseResult[]} A list of matched .onion urls and possible
                          subdomains as well as the paths and possible arguments
                          (which are counted towards the path in this case)
     */
    extractOnionURI(contentString, fromEntry={}, isHtmlString=true) {
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
            m = this.onionRegexMatch.exec(contentString);
            if (m) {
                //
                /** @type{ParseResult} */
                let result = {
                    "fullUrl": m[0],
                    "http": m[1] != null,
                    "secure": m[2] != null,
                    "www": m[3] != null,
                    "baseUrl": m[4],
                    "path": m[5] || "",
                };
                results.push(result);
            }
        } while (m);

        if (!isHtmlString) {
            return results;
        }
        let $ = cheerio.load(contentString);
        let baseUrl = $("base").attr("href") || fromEntry.url;
        let protocol = "http";
        if (fromEntry.secure){
            protocol = "https";
        }
        // Groups within relativeUrlRegexMatch:
        // group1: The full string, inclusive href
        // group2: The url enclosed in "" or ''
        // group3/4: The stripped URL (only one is defined)
        do {
            m = this.relativeUrlRegexMatch.exec(contentString);
            if (m) {
                let path = m[2] || m[3];
                let result = {
                    "fullUrl": protocol + baseUrl + "/" + path,
                    "http": true, /* Only currently supported protocol */
                    "secure": fromEntry.secure || false, /* fallback */
                    "www": false,
                    "baseUrl": baseUrl,
                    "path": path,
                };
                results.push(result);
            }
        } while (m);
        return results;
    }
}

module.exports = Parser;

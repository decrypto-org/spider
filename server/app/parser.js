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
        this.globalOnionRegexMatch = new RegExp(
            "(?:http(s)?:\/\/)?(?:www.)?(?:([-a-z0-9.]+[.]){0,242}([-a-z0-9=]{15,256}\.onion)(?::[0-9]{1,6})?)(\/[-a-z0-9@:%_+.~#?&\/=|$]+)?",
            "gi"
        );
        this.globalBaseUrlMatch = new RegExp(
            "(?:http(s)?:\/\/)?(?:www.)?([-a-z0-9=]{15,256}\.onion)",
            "gi"
        );
        this.singleOnionRegexMatch = new RegExp(
            "(?:http(s)?:\/\/)?(?:www\.)?(?:([-a-z0-9\.]+[.]){0,242}([-a-zA-Z0-9=]{15,256}\.onion)(?::[0-9]{1,6})?)(\/[-a-z0-9@:%_+\.~#?&\/=]*)?",
            "i"
        );

        // Note: We only keep sites that have textual data encoded, the rest
        // will be discarded as of now.
        this.base64Regex = new RegExp(
            /\s*data:([^tex]+\/[a-z]+(;[a-z\-]+\=[a-z\-]+)?)?(;base64)?,[a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*/i
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
            logger.warn(
                "[CONTAINS MEDIA DATA] Discarding " + stringToTest.slice(0, 100)
            );
        }
        return result;
    }

    /**
     * @typedef ParseResult
     * @type{object}
     * @property {boolean} secure - Indicates whether https (true) was used or
     *                              not (false).
     * @property {string} subdomain Eventual subdomains, such that we can
     *                              clearly distinguish between hosts
     * @property {string} baseUrl - The base url, including any possible http,
     *                              https, www or subdomains.
     * @property {string} path - The path, including any parameters or hooks
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
        // group0: The whole url
        // group1: http or https (secure)
        // group2: subdomain
        // group3: baseUrl
        // group4: The path

        let results = [];
        let $ = cheerio.load(contentString);
        let relativeBaseUrl = $("base").attr("href") || fromEntry.url;
        let baseUrlSet = new Set();
        if (isHtmlString) {
            $("a").each((i, elem) => {
                let uri = $(elem).attr("href");
                if (!uri) {
                    // Example of how this could happen:
                    // <a id="top"></a>
                    return true;
                }
                if (uri.startsWith("#")) {
                    // we ignore anchors, since they refere to the same page
                    return true; // equaly continue in .each syntax
                } else if (uri.startsWith("/") && fromEntry != {}) {
                    // we are working with a relative url. Get baseurl
                    // from the fromEntry
                    results.push({
                        secure: fromEntry.secure || false,
                        subdomain: fromEntry.subdomain || "",
                        baseUrl: relativeBaseUrl,
                        path: uri,
                    });
                    return true;
                } else if (uri.startsWith("/") && fromEntry == {}) {
                    if (relativeBaseUrl) {
                        results.push({
                            secure: fromEntry.secure || false,
                            subdomain: fromEntry.subdomain || "",
                            baseUrl: relativeBaseUrl,
                            path: uri,
                        });
                        return true;
                    }
                    logger.warn(
                        "[PARSER]\n"
                        + "Found relative URI, but no fromEntry was specified\n"
                        + "Ignoring this entry."
                    );
                    return true;
                } else {
                    // Here we need to parse a full uri
                    // lets first try again with the regex
                    let parsed = this.singleOnionRegexMatch.exec(uri);
                    if (parsed) {
                        let secure = false;
                        if (parsed[1] === "s") {
                            secure = true;
                        }
                        results.push({
                            secure: secure,
                            subdomain: parsed[2] || "",
                            baseUrl: parsed[3],
                            path: parsed[4] || "",
                        });
                        baseUrlSet.add(parsed[3]);
                    }
                }
            });
            let baseUrl;
            do {
                baseUrl = this.globalBaseUrlMatch.exec(contentString);
                if (baseUrl && !baseUrlSet.has(baseUrl[2])) {
                    let secure = false;
                    if (baseUrl[1] === "s") {
                        secure = true;
                    }
                    results.push({
                        secure: secure,
                        subdomain: "",
                        baseUrl: baseUrl[2],
                        path: "",
                    });
                    baseUrlSet.add(baseUrl[2]);
                }
            } while (baseUrl);
        } else {
            // fallback to slow regex
            let m;
            do {
                m = this.globalOnionRegexMatch.exec(contentString);
                if (m) {
                    let secure = false;
                    if (m[1] === "s") {
                        secure = true;
                    }
                    /** @type{ParseResult} */
                    let result = {
                        secure: secure,
                        subdomain: m[2] || "",
                        baseUrl: m[3],
                        path: m[4] || "",
                    };
                    results.push(result);
                }
            } while (m);
        }
        return results;
    }
}

module.exports = Parser;

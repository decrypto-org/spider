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
     * Extract all .onion URI within the string
     * @param {string} contentString - String (typically a HTML or JSON) from
     *                                 which .onion uris should be extracted.
     * @return {Array.<?string>} A list of matched .onion urls and possible
                          subdomains as well as the paths and possible arguments
                          (which are counted towards the path in this case)
                          <ul style="list-style: none">
                            <li> 0. Entry: The whole url
                            <li> 1. Entry: http or https
                            <li> 2. Entry: indicates whether http or https
                                (by s) was used
                            <li> 3. Entry: Would match any www.
                            <li> 4. Entry: Base url (including possible
                                subdomains)
                            <li> 5. Entry: Path (including url encoded
                                parameters)
                          </ul>
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
                results.push(m);
            }
        } while (m);
        return results;
    }
}

module.exports = Parser;

/* eslint-disable no-unused-vars */
let chai = require("chai");
let chaiHttp = require("chai-http");
let Conductor = require("../app/conductor");
let network = require("../app/network");
let Parser = require("../app/parser");
let models = require("../app/models");
let should = chai.should();
let logger = require("../app/library/logger");
let fs = require("fs");

require("../app/extensions/Set");
require("../app/extensions/Object");
/* global describe, it */
chai.use(chaiHttp);

// Following: Often used values in the tests
// First: For initializing the Conductor
let startUrls = ["msydqstlz2kzerdg.onion"];
let cutOffDepth = 0;
// We use the default tor port for testing, since the tests will mostly
// run on travis and there shouldn't be a tor instance running at the time
// of those tests. Locally, one could adapt or just terminate the tor
// instance to run the tests.
let torPort = 9050;
let extractUriHtml = fs.readFileSync(
    __dirname + "/data/hiddenWiki.html"
).toString("utf8");
let replaceBase64Html = fs.readFileSync(
    __dirname + "/data/base64.html"
).toString("utf8");
let testDbResponse = {
    "baseUrl": "testBaseUrl.onion",
    "secure": true,
};
/* eslint-disable max-len */


/* eslint-enable no-unused-vars */

describe("Parser.extractOnionURI", () => {
    let parser = new Parser();
    it("should return a list of all found .onion urls @type{ParseResult}", (done) => {
        // First test our simples example: one url
        let result = parser.extractOnionURI("msydqstlz2kzerdg.onion", {}, false);
        result.length.should.equal(1);
        result[0].secure.should.equal(false);
        result[0].subdomain.should.equal("");
        result[0].baseUrl.should.equal("msydqstlz2kzerdg.onion");
        result[0].path.should.equal("");
        result = parser.extractOnionURI(extractUriHtml, testDbResponse);
        console.log(result);
        result.length.should.equal(298);
        done();
    });
});

describe("Parser.removeBase64Media", () => {
    let parser = new Parser();
    it("should return a string without any media content", (done) => {
        let result = parser.removeBase64Media(replaceBase64Html);
        result.split("[OMITTED MEDIA DATA]").length.should.equal(4);
        done();
    });
});

describe("Conductor.insertUriIntoDB", () => {
    it("should insert a new baseUrl if no such entry existed before, unique on baseUrl field");
    it("should not insert a new baseUrl entry into the DB if already on exists");
    it("should insert a new path Entry if no path entry exists for path and baseUrlId combo");
    it("should update an already existing path entry on the timestamps columns");
});

describe("Conductor.insertLinkIntoDB", () => {
    it("should insert a new link entry into the database");
});

describe("Conductor.insertBodyIntoDB", () => {
    it("should create a new content entry in the database");
});

describe("Conductor.getEntriesFromDb", () => {
    it("should return a list of db response objects if available");
    it("should return a boolean that is false, indicating no more data");
});

describe("Network.build", () => {
    it("should initialize the Tor module");
    it("should initialize the network modules");
});

describe("Network.startNetwork", () => {
    it("should call the emitter, which should emit MAX_SLOTS many NETWORK_READY events");
});

describe("Network.emitNetworkReady", () => {
    it("should emit a NETWORK_READY event as often as free slots are available");
});

describe("Network.freeUpSlot", () => {
    it("should increase the availableSlots field by one");
    it("should terminate the process, if no pending requests and not new data from the DB is available");
    it("should emit a networkReady event on a freed up slot");
});

describe("Network.get", () => {
    it("should make an attempt to fetch a page from specified url and path");
    it("should respect the secure flag");
    it("should return a valid @type{NetworkHandlerResponse}");
});

describe("Network.responseHandler", () => {
    it("should return a @type{NetworkHandlerResponse} on any valid response");
    it("should return a @type{NetworkHandlerResponse} on any invalid response (with proper indication of failure)");
    it("should always return a @type{NetworkHandlerResponse} which contains path and url");
});

/* eslint-enable max-len */

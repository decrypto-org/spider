/* eslint-disable no-unused-vars */
let chai = require("chai");
let chaiHttp = require("chai-http");
let main = require("..");
let conductor = require("../app/conductor");
let network = require("../app/network");
let parser = require("../app/parser");
let models = require("../app/models");
let should = chai.should();
/* eslint-enable no-unused-vars */

/* global describe, it */
chai.use(chaiHttp);

/* eslint-disable max-len */

describe("Parser.extractOnionURI", () => {
    it("should return a list of all found .onion urls (@type{ParseResult}");
});

describe("Conductor.run", () => {
    it("should initialize the DB");
    it("should initialize the netwrok");
    it("should insert start url into the db");
    it("should start the network");
})

describe("Conductor.runScraper", () => {
    it("should initialize the field cachedDbResults");
    it("should register a listener for the NETWORK_READY event");
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
})

describe("Network.startNetwork", () => {
    it("should call the emitter, which should emit MAX_SLOTS many NETWORK_READY events");
})

describe("Network.emitNetworkReady", () => {
    it("should emit a NETWORK_READY event as often as free slots are available");
})

describe("Network.freeUpSlot", () => {
    it("should increase the availableSlots field by one");
    it("should terminate the process, if no pending requests and not new data from the DB is available");
    it("should emit a networkReady event on a freed up slot");
})

describe("Network.get", () => {
    it("should make an attempt to fetch a page from specified url and path");
    it("should respect the secure flag");
    it("should return a valid @type{NetworkHandlerResponse}");
})

describe("Network.responseHandler", () => {
    it("should return a @type{NetworkHandlerResponse} on any valid response");
    it("should return a @type{NetworkHandlerResponse} on any invalid response (with proper indication of failure)");
    it("should always return a @type{NetworkHandlerResponse} which contains path and url");
})

/* eslint-enable max-len */

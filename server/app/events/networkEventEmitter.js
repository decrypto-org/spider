let EventEmitter = require("events");

/**
 * The Network Event Emitter emits an event with new network Data everytime the
 * network returned new data (e.g. fetched urls) and promotes the data to
 * the listeners
 */
class NetworkEvent extends EventEmitter {
    /**
     * Event thrown when new data is gathered from the database
     */
    static get NEW_CONTENT_DATA_EVENT() {
        return "newContentData";
    }
    /**
     * Event thrown when no new data is available from the database
     */
    static get NETWORK_READY() {
        return "networkReady";
    }
}

module.exports = NetworkEvent;

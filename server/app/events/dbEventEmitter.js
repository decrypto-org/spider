let EventEmitter = require("events");

/**
 * The DB Event Emitter emits an event with new DB Data everytime the
 * DB returned new data (e.g. URLS to be fetched) and promotes the data to
 * the listeners
 */
class DbEvent extends EventEmitter {
    /**
     * Event thrown when new data is gathered from the database
     */
    static get NEW_DB_DATA_EVENT() {
        return "newDbData";
    }
    /**
     * Event thrown when no new data is available from the database
     */
    static get NO_DB_DATA_EVENT() {
        return "noDbDataAvailable";
    }
}

module.exports = DbEvent;

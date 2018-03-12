let {logger} = require("./library/logger");

const {Pool} = require("pg");
const Sequelize = require("sequelize");


/* If we encounter an error in the connection to the database, we throw
 * an error. Background: The caller is the only one to decide, whether to
 * abort the run or not (e.g. insertion of a path - probably not,
 * log an error and continue) Insertion fails for like x consecutive tries:
 * terminate with nonzero --> Connection to DB lost
 */

let DB = class DB {
    constructor() {
        // Set up sequelize. According to doku, we should only have
        // one instance, therefor keeping the DB module in place
        this.sequelize = new Sequelize(
            process.env.DB_NAME,
            process.env.DB_USER,
            process.env.DB_PASSWORD,
            {
                host: process.env.DB_HOST,
                port: process.env.DB_PORT,
                dialect: "postgres",
                pool: {
                    max: process.env.DB_MAX_CONNECTIONS,
                    min: process.env.DB_MIN_CONNECTIONS
                },
                operatorsAliases: false
            });

        // Test connection -- to make sure everything works before proceeding
        this.sequelize
            .authenticate()
            .then( () => {
                logger.info("Database: Connection established");
            })
            .catch(err => {
                logger.error("Database: Unable to connect to database:", err);
            });
        
        // Load models
        this.baseUrlTable = this.sequelize.import(
            process.env.TDSE_HOST_SPIDER_REPO + "/server/app/models/baseUrl"
        );

        // Set up db connections pool 
        this._db_connection_pool = new Pool({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT
        });

        this._db_connection_pool.on("error", (err, client) => {
            logger.error(
                "unexpected error on idle client",
                {"err": err, "client": client}
            );
            process.exit(-1);
        });
    }

    // DB Access functions
    async execute_query(query, num_retries=10) {
        let current_number_of_retries = 0;
        while (current_number_of_retries < num_retries){
            let client;
            try{
                client = await this._db_connection_pool.connect();
                const res = await client.query(query);
                logger.info("Response for query " + query.text, res);
                return res.rows;
            }
            catch(e){
                current_number_of_retries ++;
                if (current_number_of_retries >= num_retries){
                    logger.error(
                        "An error occured while accessing the database.\n\
                        For more information, please see the stack trace"
                    );
                    logger.error(e.stack);
                    logger.error("=========== DEBUG INFORMATION ===========");
                    logger.error("Query was not executed: ", query);
                    logger.error(
                        "DB connection pool: ",
                        this._db_connection_pool
                    );
                }
            }
            finally{
                if (client){
                    client.release();
                }
            }
        }
    }

    async get_base_url_id(base_url){
        let query = {
            text: "\
                SELECT (baseurlid) \
                FROM baseurl \
                WHERE baseurl.baseurl = $1",
            values: [base_url]
        };
        let res = await this.execute_query(query);
        if(!res)
            return null;
        let base_url_id;
        if (res.length != 0){
            // Any url should be unique by constraint on the db,
            // so we can assume len(res) is either 1 or 0
            base_url_id = res[0].baseurlid;
        }
        return base_url_id;
    }

    async get_base_url(base_url_id){
        let query = {
            text: "\
                SELECT (baseurl) \
                FROM baseurl \
                WHERE baseurl.baseurlid = $1",
            values: [base_url_id]
        };
        let res = await this.execute_query(query);
        if (!res)
            return null;
        let base_url = "";
        if(res.length != 0){
            base_url = res[0].baseurl;
        }
        return base_url;
    }

    async add_base_url(base_url){
        let query = {
            text: "\
                INSERT INTO baseurl(baseurl) \
                VALUES($1) \
                ON CONFLICT(baseurl) DO NOTHING \
                RETURNING baseurlid",
            values: [base_url]
        };
        let res = await this.execute_query(query);
        if(!res)
            return null;
        let base_url_id;
        if(res.length == 0)
            base_url_id = null;
        else
            base_url_id = res[0].baseurlid;
        return base_url_id;
    }

    async add_path(path, timestamp, success, contains_data, base_url_id) {
        let last_successful_timestamp = 0;
        if (success){
            last_successful_timestamp = timestamp;
        }
        let query = {
            text: "\
                INSERT INTO paths(\
                    lastscrapedtimestamp,\
                    lastsuccessfultimestamp,\
                    containsdata,\
                    path,\
                    baseurlid\
                )\
                VALUES ($1, $2, $3, $4, $5)\
                ON CONFLICT (baseurlid, path) DO NOTHING \
                RETURNING pathid",
            values: [
                timestamp,
                last_successful_timestamp,
                contains_data,
                path,
                base_url_id
            ]
        };
        let response = await this.execute_query(query);
        if (!response)
            return null;
        let path_id = null;
        if (response.length != 0){
            path_id = response[0].pathid;
        }
        return path_id;
    }

    async update_path(path, timestamp, success, contains_data, base_url_id) {
        let query = {};
        if (success){
            query = {
                text: "\
                    UPDATE paths \
                    SET \
                        lastscrapedtimestamp=$1,\
                        lastsuccessfultimestamp=$2,\
                        containsdata=$3 \
                    WHERE baseurlid=$4 and path=$5 \
                    RETURNING pathid",
                values: [
                    timestamp,
                    timestamp,
                    contains_data,
                    base_url_id,
                    path
                ]
            };

        }
        else{
            query = {
                text: "\
                    UPDATE paths \
                    SET lastscrapedtimestamp=$1 \
                    WHERE baseurlid=$2 and path=$3 \
                    RETURNING pathid",
                values: [
                    timestamp,
                    base_url_id,
                    path
                ]
            };
        }
        let response = await this.execute_query(query);
        if(!response)
            return null;
        let path_id = null;
        if (response.length != 0){
            path_id = response[0].pathid;
        }
        return path_id;
    }

    async get_path_id(path, base_url_id) {
        let query = {
            text: "\
                SELECT (pathid) \
                FROM paths \
                WHERE paths.path = $1 and paths.baseurlid = $2",
            values: [path, base_url_id]
        };
        let res = await this.execute_query(query);
        if(!res)
            return null;
        let path_id = null;
        if (res.length != 0){
            path_id = res[0].pathid;
        }
        return path_id;
    }

    async insert_content(content, pathid, timestamp) {
        let query = {
            text: "\
                INSERT INTO content (scrapetimestamp, content, pathid) \
                VALUES ($1, $2, $3)\
                RETURNING contentid",
            values: [timestamp, content, pathid]
        };
        let res = await this.execute_query(query);
        if(!res)
            return null;
        let content_id = null;
        if (res.length != 0){
            content_id = res[0].contentid;
        }
        return content_id;
    }

    // Public insert functions
    async insert_response(
        url, path, body, success_flag, contains_data, fresh_insert
    ) {

        if (contains_data === undefined)
            contains_data = true;
        if (success_flag === undefined)
            success_flag = true;
        if (fresh_insert === undefined)
            fresh_insert = false;

        // Take a timestamp. This is used as
        //      a) scraped timestamp
        //      b) as lastsuccessfultimestamp
        // This timestamp is in ms
        // TODO: Do we need this precision? higher/lower?
        let timestamp;
        if (fresh_insert){
            timestamp = 0;
        } 
        else {
            timestamp = new Date().getTime();
        }

        // Insert or get base url / base url id
        let base_url_id =  await this.add_base_url(url);

        // If base_url_id is undefined/null, there exists already an entry 
        // for this url, therefor we only need to get the id
        if(!base_url_id){
            base_url_id = await this.get_base_url_id(url);
        }
        if(!base_url_id){
            logger.error("An error occured while getting the base_url_id:\n\
                Does not exist and cannot be inserted.\n\
                Please check the DB connection.");
            // Return immediately, when we do not have a base url,
            // we can not proceed
            return;
        }
        // Insert path / get path id
        let path_id = await this.add_path(
            path,
            timestamp,
            success_flag,
            contains_data,
            base_url_id
        );
        // if path_id is undefined/null, there exists already an entry,
        // we therefor only need to update
        if(!path_id){
            path_id = await this.update_path(
                path,
                timestamp,
                success_flag,
                contains_data,
                base_url_id
            );
        }
        // Now path_id should be defined anyway.
        // If this is not the case something very strange happened
        if(!path_id){
            logger.error(
                "An error occured while storing/updating the path.\n\
                Please check the DB connection"
            );
            return;
        }

        // We only insert the scraped body, if the scrap was successful.
        // Otherwise we only insert the attempts
        let content_id;
        if (success_flag){
            // Insert scraped Content into database. We assume here,
            // that the filtering already happened and we only handle strings
            content_id = await this.insert_content(
                body,
                path_id,
                timestamp
            );
        }
        return (base_url_id, path_id, content_id);
    }
};

exports.DB = DB;

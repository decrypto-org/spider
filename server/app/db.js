const { Pool } = require('pg');


/* If we encounter an error in the connection to the database, we throw
 * an error. Background: The caller is the only one to decide, whether to
 * abort the run or not (e.g. insertion of a path - probably not, log an error and continue)
 * Insertion fails for like x consecutive tries: terminate with nonzero --> Connection to DB lost
 */

var DB = class DB{
	constructor(){
		// Set up db connections pool 
		this._db_connection_pool = new Pool({
			user: 'tdse',
			host: '0.0.0.0',
			database: 'DARKNET_DATA_DUMP',
			password: 'tdse_d3f4u1t_d4t4b4s3_for_hon3y_coll3ction',
			port: 5432
		});

		this._db_connection_pool.on('error', (err, client) => {
			console.error('unexpected error on idle client', err);
			process.exit(-1);
		});
	}

	// DB Access functions
	async execute_query(query, num_retries=10){
		var current_number_of_retries = 0;
		while (current_number_of_retries < num_retries){
			var client;
			try{
				client = await this._db_connection_pool.connect();
				const res = await client.query(query);
				console.log(res);
				return res.rows;
			}
			catch(e){
				current_number_of_retries ++;
				if (current_number_of_retries >= num_retries){
					console.error("An error occured while accessing the database. For more information, please see the stack trace")
					console.error(e.stack);
					console.error("============ DEBUG INFORMATION ============");
					console.error("Query was not executed: " + query);
					console.error("DB connection pool: " + this._db_connection_pool);
				}
			}
			finally{
				if (client){
					client.release();
				}
			}
		}
	}

	async get_base_url_id(base_url, callback){
		var query = {
			text: '\
				SELECT (baseurlid) \
				FROM baseurl \
				WHERE baseurl.baseurl = $1',
			values: [base_url]
		};
		var res = await this.execute_query(query);
		var base_url_id;
		if (len(res) != 0){
			// Any url should be unique by constraint on the db, so we can assume len(res) is either 1 or 0
			base_url_id = res[0].baseurlid;
		}
		if(!callback){
			return res;
		}
		else {
			callback(res);
		}
	}

	async get_base_url(base_url_id, callback){
		var query = {
			text: '\
				SELECT (baseurl) \
				FROM baseurl \
				WHERE baseurl.baseurlid = $1',
			values: [base_url_id]
		};
		var res = await this.execute_query(query);
		if(!callback){
			return res;
		}
		else {
			callback(res);
		}
	}

	async add_base_url(base_url, callback){
		var query = {
			text: '\
				INSERT INTO baseurl(baseurl) \
				VALUES($1) \
				ON CONFLICT(baseurl) DO NOTHING \
				RETURNING baseurlid',
			values: [base_url]
		};
		var res = await this.execute_query(query);
		var base_url_id;
		if(len(res) == 0)
			base_url_id = null
		else
			base_url_id = res[0].baseurlid;
		if(!callback){
			return base_url_id;
		}
		else {
			callback(base_url_id);
		}
	}

	async add_path(path, timestamp, success, contains_data, base_url_id, callback){
		var last_successful_timestamp = 0;
		if (success){
			last_successful_timestamp = timestamp;
		}
		var query = {
			text: '\
				INSERT INTO paths(lastscrapedtimestamp, lastsuccessfultimestamp, containsdata, path, baseurlid)\
				VALUES ($1, $2, $3, $4, $5)\
				ON CONFLIC (baseurlid, path) DO NOTHING \
				RETURNING pathid',
			values: [
				timestamp,
				last_successful_timestamp,
				contains_data,
				path,
				base_url_id
			]
		};
		var response = await this.execute_query(query);
		if (!callback){
			return response;
		}
		else {
			callback(response);
		}
	}

	async update_path(path, timestamp, success, contains_data, base_url_id, callback){
		var query = {};
		if (success){
			query = {
				text: '\
					UPDATE paths \
					SET lastscrapedtimestamp=$1, lastsuccessfultimestamp=$2, contains_data=$3 \
					WHERE baseurlid=$4 and path=$5 \
					RETURNING pathid',
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
				text: '\
					UPDATE paths \
					SET lastscrapedtimestamp=$1 \
					WHERE baseurlid=$2 and path=$3 \
					RETURNING pathid',
				values: [
					timestamp,
					base_url_id,
					path
				]
			};
		}
		var response = await this.execute_query(query);
		if (!callback){
			return response;
		}
		else {
			callback(response);
		}
	}

	async get_path_id(path, base_url_id){
		var query = {
			text: '\
				SELECT (pathid) \
				FROM paths \
				WHERE paths.path = $1 and paths.baseurlid = $2',
			values: [path, base_url_id]
		};
		var res = await this.execute_query(query);
		if(!callback){
			return res;
		}
		else {
			callback(res);
		}
	}

	async insert_content(content, pathid, timestamp){
		var query = {
			text: '\
				INSERT INTO content (scrapetimestamp, content, pathid) \
				VALUES ($1, $2, 3)\
				RETURNING contentid',
			values: [timestamp, content, pathid]
		}
		var res = await this.execute_query(query);
		if(!callback){
			return res;
		}
		else {
			callback(res);
		}
	}

	// Public insert functions
	async insert_response(url, path, body){
		var base_url_id =  await this.add_base_url(url);
		if(!base_url_id){
			base_url_id = await this.get_base_url_id(url);
		}
		if(!base_url_id){
			console.error("An error occured while getting the base_url_id: Does not exist and cannot be inserted.\n\
				Please check the DB connection.");
			return; // Return immediately, when we do not have a base url we can not proceed
		}
	}
}

exports.DB = DB;

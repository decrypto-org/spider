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
		if(!res)
			return null;
		var base_url_id;
		if (res.length != 0){
			// Any url should be unique by constraint on the db, so we can assume len(res) is either 1 or 0
			base_url_id = res[0].baseurlid;
		}
		if(!callback){
			return base_url_id;
		}
		else {
			callback(base_url_id);
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
		if (!res)
			return null;
		if(res.length != 0){
			base_url = res[0].baseurl;
		}
		if(!callback){
			return base_url;
		}
		else {
			callback(base_url);
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
		if(!res)
			return null;
		var base_url_id;
		if(res.length == 0)
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
				ON CONFLICT (baseurlid, path) DO NOTHING \
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
		if (!response)
			return null;
		var path_id = null;
		if (response.length != 0){
			path_id = response[0].pathid;
		}
		if (!callback){
			return path_id;
		}
		else {
			callback(path_id);
		}
	}

	async update_path(path, timestamp, success, contains_data, base_url_id, callback){
		var query = {};
		if (success){
			query = {
				text: '\
					UPDATE paths \
					SET lastscrapedtimestamp=$1, lastsuccessfultimestamp=$2, containsdata=$3 \
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
		if(!response)
			return null;
		var path_id = null;
		if (response.length != 0){
			path_id = response[0].pathid;
		}
		if (!callback){
			return path_id;
		}
		else {
			callback(path_id);
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
		if(!res)
			return null;
		var path_id = null;
		if (response.length != 0){
			path_id = response[0].pathid;
		}
		if(!callback){
			return path_id;
		}
		else {
			callback(path_id);
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
		if(!res)
			return null;
		var content_id = null;
		if (response.length != 0){
			content_id = response[0].contentid;
		}
		if(!callback){
			return content_id;
		}
		else {
			callback(content_id);
		}
	}

	// Public insert functions
	async insert_response(url, path, body, success_flag, contains_data, fresh_insert){

		if (contains_data === undefined)
			contains_data = true;
		if (success_flag === undefined)
			success_flag = true;
		if (fresh_insert === undefined)
			fresh_insert = false;

		// Take a timestamp. This is used as a) scraped timestamp, b) as lastsuccessfultimestamp
		// This timestamp is in ms - TODO: Do we need this precision? higher/lower?
		var timestamp;
		if (fresh_insert){
			timestamp = 0;
		} 
		else {
			timestamp = new Date().getTime();
		}

		// Insert or get base url / base url id
		var base_url_id =  await this.add_base_url(url);

		// If base_url_id is undefined/null, there exists already an entry for this url, therefor we only need to get the id
		if(!base_url_id){
			base_url_id = await this.get_base_url_id(url);
		}
		if(!base_url_id){
			console.error(TAG + "An error occured while getting the base_url_id: Does not exist and cannot be inserted.\n\
				Please check the DB connection.");
			return; // Return immediately, when we do not have a base url we can not proceed
		}
		// Insert path / get path id
		var path_id = await this.add_path(
			path,
			timestamp,
			success_flag,
			contains_data,
			base_url_id
		);
		// if path_id is undefined/null, there exists already an entry, we therefor only need to update
		if(!path_id){
			var path_id = await this.update_path(
				path,
				timestamp,
				success_flag,
				contains_data,
				base_url_id
			);
		}
		// Now path_id should be defined anyway. if it is not something very strange happened
		if(!path_id){
			console.error("An error occured while storing/updating the path. Please check the DB connection");
			return;
		}

		// We only insert the scraped body, if the scrap was successful. Otherwise we only insert the attempts
		if (success_flag){
			// Insert scraped Content into database. We assume here, that the filtering already happened and we only handle string values
			var content_id = await this.insert_content(
				body,
				path_id,
				timestamp
			);
		}
	}
}

exports.DB = DB;

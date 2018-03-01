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

	execute_query(query, callback, num_retries=10){
		var current_number_of_retries = 0;
		while (current_number_of_retries < num_retries){
			const client = await this._db_connection_pool.connect();
			try{
				const res = await client.query(query);
				console.log(res);
				if(!callback){
					return res;
				} 
				else{
					callback(res);
				}
			}
			catch(e){
				current_number_of_retries ++;
				if (current_number_of_retries >= num_retries){
					console.error("An error occured while accessing the database. For more information, please see the stack trace")
					console.error(e.stack);
					throw Error("An error occured while accessing the database: " + e.message);
				}
			}
			finally{
				client.release();
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
		if(!callback){
			return await this.execute_query(query);
		}
		else {
			this.execute_query(query, callback);
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
		if(!callback){
			return await this.execute_query(query);
		}
		else {
			this.execute_query(query, callback);
		}
	}

	async add_base_url(base_url, callback){
		var query = {
			text: '\
				INSERT INTO baseurl(baseurl) \
				VALUES($1) \
				ON CONFLICT(baseurl) DO NOTHING',
			values: [base_url]
		};
		if (!callback){
			await this.execute_query(query);
		}
		else {
			this.execute_query(query, callback);
		}
	}

	add_path(path, timestamp, success, contains_data, ){
		// return ID
	}
}

exports.DB = DB;

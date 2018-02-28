const { Pool } = require('pg');

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

	write(table_name, data /* JSON: key: value */){
		// returns id
		// INSERT INTO table (data.keys())
		// VALUES data.values()
		// RETURNING *
	}

	read(table_name, querystring){

	}

	add_base_url(base_url){
		var query = {
			text: '\
				INSERT INTO baseurl(baseurl) \
				VALUES($1) \
				RETURNING baseurlid',
			values: ['msydqstlz2kzerdg.onion']
		}
		this._db_connection_pool.connect((err, client, done) => {
			if(err) throw err;
			client.query(query, (err, res) => {
				done();
				if(err){
					console.log(err.stack);
				}
				else {
					console.log(res.rows);
				}
			});
		});
	}

	add_path(path, timestamp, success, contains_data, ){
		// return ID
	}
}

exports.DB = DB;

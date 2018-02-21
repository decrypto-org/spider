const spider = require('./spider')

exports.init = function(){
	// Add helper functions to Set
	Set.prototype.difference = function(b){ return new Set([...this].filter(x => !b.has(x))); }
	
	spider.start_spider()
}
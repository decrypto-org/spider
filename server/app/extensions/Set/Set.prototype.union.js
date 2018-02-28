// Add helper functions to Set
if(!Set.prototype.union){
	Set.prototype.union = function(b)
	{
		return new Set(Array.from(this).concat(Array.from(b)));
	}
}
// Add helper functions to Set
Set.prototype.toString = function()
{
	return "(" + Array.from(this).join(', ') + ")";
}
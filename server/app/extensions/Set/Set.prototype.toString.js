// Add helper functions to Set
/* eslint-disable no-extend-native */
Set.prototype.toString = function() {
    return "(" + Array.from(this).join(", ") + ")";
};

// Add helper functions to Set
/* eslint-disable no-extend-native */
if (!Set.prototype.difference) {
    Set.prototype.difference = function(b) {
        return new Set(Array.from(this).filter((x) => !b.has(x)));
    };
}

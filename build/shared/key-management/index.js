"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keyPool = exports.createGenericGetLockoutPeriod = void 0;
const key_pool_1 = require("./key-pool");
function createGenericGetLockoutPeriod(getKeys) {
    return function (family) {
        const keys = getKeys();
        const activeKeys = keys.filter((k) => !k.isDisabled && (!family || k.modelFamilies.includes(family)));
        if (activeKeys.length === 0)
            return 0;
        const now = Date.now();
        const rateLimitedKeys = activeKeys.filter((k) => now < k.rateLimitedUntil);
        const anyNotRateLimited = rateLimitedKeys.length < activeKeys.length;
        if (anyNotRateLimited)
            return 0;
        return Math.min(...activeKeys.map((k) => k.rateLimitedUntil - now));
    };
}
exports.createGenericGetLockoutPeriod = createGenericGetLockoutPeriod;
exports.keyPool = new key_pool_1.KeyPool();
//# sourceMappingURL=index.js.map
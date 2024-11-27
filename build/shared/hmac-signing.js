"use strict";
/** Module for generating and verifying HMAC signatures. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signMessage = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
/**
 * Generates a HMAC signature for the given message. Optionally salts the
 * key with a provided string.
 */
function signMessage(msg, salt = "") {
    const hmac = crypto_1.default.createHmac("sha256", config_1.SECRET_SIGNING_KEY + salt);
    if (typeof msg === "object") {
        hmac.update(JSON.stringify(msg));
    }
    else {
        hmac.update(msg);
    }
    return hmac.digest("hex");
}
exports.signMessage = signMessage;
//# sourceMappingURL=hmac-signing.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRisuToken = void 0;
/**
 * Authenticates RisuAI.xyz users using a special x-risu-tk header provided by
 * RisuAI.xyz. This lets us rate limit and limit queue concurrency properly,
 * since otherwise RisuAI.xyz users share the same IP address and can't be
 * distinguished.
 * Contributors: @kwaroran
 */
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../logger");
const log = logger_1.logger.child({ module: "check-risu-token" });
const RISUAI_PUBLIC_KEY = `
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArEXBmHQfy/YdNIu9lfNC
xHbVwb2aYx07pBEmqQJtvVEOISj80fASxg+cMJH+/0a/Z4gQgzUJl0HszRpMXAfu
wmRoetedyC/6CLraHke0Qad/AEHAKwG9A+NwsHRv/cDfP8euAr20cnOyVa79bZsl
1wlHYQQGo+ve+P/FXtjLGJ/KZYr479F5jkIRKZxPE8mRmkhAVS/u+18QM94BzfoI
0LlbwvvCHe18QSX6viDK+HsqhhyYDh+0FgGNJw6xKYLdExbQt77FSukH7NaJmVAs
kYuIJbnAGw5Oq0L6dXFW2DFwlcLz51kPVOmDc159FsQjyuPnta7NiZAANS8KM1CJ
pwIDAQAB`;
let IMPORTED_RISU_KEY = null;
(async () => {
    try {
        log.debug("Importing Risu public key");
        IMPORTED_RISU_KEY = await crypto_1.default.subtle.importKey("spki", Buffer.from(RISUAI_PUBLIC_KEY.replace(/\s/g, ""), "base64"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["verify"]);
        log.debug("Imported Risu public key");
    }
    catch (err) {
        log.warn({ error: err.message }, "Error importing Risu public key");
        IMPORTED_RISU_KEY = null;
    }
})();
async function checkRisuToken(req, _res, next) {
    let header = req.header("x-risu-tk") || null;
    if (!header || !IMPORTED_RISU_KEY) {
        return next();
    }
    try {
        const { valid, data } = await validCheck(header);
        if (!valid || !data) {
            req.log.warn({ token: header, data }, "Invalid RisuAI token; using IP instead");
        }
        else {
            req.log.info("RisuAI token validated");
            req.risuToken = String(data.id);
        }
    }
    catch (err) {
        req.log.warn({ error: err.message }, "Error validating RisuAI token; using IP instead");
    }
    next();
}
exports.checkRisuToken = checkRisuToken;
async function validCheck(header) {
    let tk;
    try {
        tk = JSON.parse(Buffer.from(decodeURIComponent(header), "base64").toString("utf-8"));
    }
    catch (err) {
        log.warn({ error: err.message }, "Provided unparseable RisuAI token");
        return { valid: false };
    }
    const data = tk.data;
    const sig = Buffer.from(tk.sig, "base64");
    if (data.expiresIn < Math.floor(Date.now() / 1000)) {
        log.warn({ token: header }, "Provided expired RisuAI token");
        return { valid: false };
    }
    const valid = await crypto_1.default.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, IMPORTED_RISU_KEY, sig, Buffer.from(JSON.stringify(data)));
    if (!valid) {
        log.warn({ token: header }, "RisuAI token failed signature check");
    }
    return { valid, data };
}
//# sourceMappingURL=check-risu-token.js.map
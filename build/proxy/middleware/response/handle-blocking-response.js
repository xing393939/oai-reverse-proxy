"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleBlockingResponse = void 0;
const common_1 = require("../common");
const compression_1 = require("./compression");
/**
 * Handles the response from the upstream service and decodes the body if
 * necessary. If the response is JSON, it will be parsed and returned as an
 * object. Otherwise, it will be returned as a string. Does not handle streaming
 * responses.
 * @throws {Error} Unsupported content-encoding or invalid application/json body
 */
const handleBlockingResponse = async (proxyRes, req, res) => {
    if (req.isStreaming) {
        const err = new Error("handleBlockingResponse called for a streaming request.");
        req.log.error({ stack: err.stack, api: req.inboundApi }, err.message);
        throw err;
    }
    return new Promise((resolve, reject) => {
        let chunks = [];
        proxyRes.on("data", (chunk) => chunks.push(chunk));
        proxyRes.on("end", async () => {
            const contentEncoding = proxyRes.headers["content-encoding"];
            const contentType = proxyRes.headers["content-type"];
            let body = Buffer.concat(chunks);
            const rejectWithMessage = function (msg, err) {
                const error = `${msg} (${err.message})`;
                req.log.warn({ msg: error, stack: err.stack }, "Error in blocking response handler");
                (0, common_1.sendProxyError)(req, res, 500, "Internal Server Error", { error });
                return reject(error);
            };
            try {
                body = await (0, compression_1.decompressBuffer)(body, contentEncoding);
            }
            catch (e) {
                return rejectWithMessage(`Could not decode response body`, e);
            }
            try {
                return resolve(tryParseAsJson(body, contentType));
            }
            catch (e) {
                return rejectWithMessage("API responded with invalid JSON", e);
            }
        });
    });
};
exports.handleBlockingResponse = handleBlockingResponse;
function tryParseAsJson(body, contentType) {
    const fs = require('fs');
    fs.appendFile('nohup-msg.txt', body + "\n", () => { });
    // If the response is declared as JSON, it must parse or we will throw
    if (contentType?.includes("application/json")) {
        return JSON.parse(body);
    }
    // If it's not declared as JSON, some APIs we'll try to parse it as JSON
    // anyway since some APIs return the wrong content-type header in some cases.
    // If it fails to parse, we'll just return the raw body without throwing.
    try {
        return JSON.parse(body);
    }
    catch (e) {
        return body;
    }
}
//# sourceMappingURL=handle-blocking-response.js.map
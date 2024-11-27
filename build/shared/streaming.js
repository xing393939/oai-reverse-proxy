"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copySseResponseHeaders = exports.initializeSseStream = void 0;
function initializeSseStream(res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // nginx-specific fix
    res.flushHeaders();
}
exports.initializeSseStream = initializeSseStream;
/**
 * Copies headers received from upstream API to the SSE response, excluding
 * ones we need to set ourselves for SSE to work.
 */
function copySseResponseHeaders(proxyRes, res) {
    const toOmit = [
        "content-length",
        "content-encoding",
        "transfer-encoding",
        "content-type",
        "connection",
        "cache-control",
    ];
    for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!toOmit.includes(key) && value) {
            res.setHeader(key, value);
        }
    }
}
exports.copySseResponseHeaders = copySseResponseHeaders;
//# sourceMappingURL=streaming.js.map
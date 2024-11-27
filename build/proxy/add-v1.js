"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addV1 = void 0;
function addV1(req, res, next) {
    // Clients don't consistently use the /v1 prefix so we'll add it for them.
    if (!req.path.startsWith("/v1/") && !req.path.startsWith("/v1beta/")) {
        req.url = `/v1${req.url}`;
    }
    next();
}
exports.addV1 = addV1;
//# sourceMappingURL=add-v1.js.map
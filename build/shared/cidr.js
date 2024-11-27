"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBlacklistMiddleware = exports.createWhitelistMiddleware = exports.parseCidrs = exports.blacklists = exports.whitelists = void 0;
const ipaddr_js_1 = __importDefault(require("ipaddr.js"));
const logger_1 = require("../logger");
const log = logger_1.logger.child({ module: "cidr" });
exports.whitelists = new Map();
exports.blacklists = new Map();
function parseCidrs(cidrs) {
    const list = Array.isArray(cidrs)
        ? cidrs
        : cidrs.split(",").map((s) => s.trim());
    return list
        .map((input) => {
        try {
            if (input.includes("/")) {
                return ipaddr_js_1.default.parseCIDR(input.trim());
            }
            else {
                const ip = ipaddr_js_1.default.parse(input.trim());
                return ipaddr_js_1.default.parseCIDR(`${input}/${ip.kind() === "ipv4" ? 32 : 128}`);
            }
        }
        catch (e) {
            log.error({ input, error: e.message }, "Invalid CIDR mask; skipping");
            return null;
        }
    })
        .filter((cidr) => cidr !== null);
}
exports.parseCidrs = parseCidrs;
function createWhitelistMiddleware(name, base) {
    let cidrs = [];
    let ranges = {};
    const middleware = (req, res, next) => {
        const ip = ipaddr_js_1.default.process(req.ip);
        const match = ipaddr_js_1.default.subnetMatch(ip, ranges, "none");
        if (match === name) {
            return next();
        }
        else {
            req.log.warn({ ip: req.ip, list: name }, "Request denied by whitelist");
            res.status(403).json({ error: `Forbidden (by ${name})` });
        }
    };
    middleware.ranges = cidrs;
    middleware.updateRanges = (r) => {
        cidrs = Array.isArray(r) ? r.slice() : [r];
        const parsed = parseCidrs(cidrs);
        ranges = { [name]: parsed };
        middleware.ranges = cidrs;
        log.info({ list: name, ranges }, "IP whitelist configured");
    };
    middleware.updateRanges(base);
    exports.whitelists.set(name, middleware);
    return middleware;
}
exports.createWhitelistMiddleware = createWhitelistMiddleware;
function createBlacklistMiddleware(name, base) {
    let cidrs = [];
    let ranges = {};
    const middleware = (req, res, next) => {
        const ip = ipaddr_js_1.default.process(req.ip);
        const match = ipaddr_js_1.default.subnetMatch(ip, ranges, "none");
        if (match === name) {
            req.log.warn({ ip: req.ip, list: name }, "Request denied by blacklist");
            return res.status(403).json({ error: `Forbidden (by ${name})` });
        }
        else {
            return next();
        }
    };
    middleware.ranges = cidrs;
    middleware.updateRanges = (r) => {
        cidrs = Array.isArray(r) ? r.slice() : [r];
        const parsed = parseCidrs(cidrs);
        ranges = { [name]: parsed };
        middleware.ranges = cidrs;
        log.info({ list: name, ranges }, "IP blacklist configured");
    };
    middleware.updateRanges(base);
    exports.blacklists.set(name, middleware);
    return middleware;
}
exports.createBlacklistMiddleware = createBlacklistMiddleware;
//# sourceMappingURL=cidr.js.map
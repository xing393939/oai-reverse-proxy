"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = void 0;
const config_1 = require("../config");
const ADMIN_KEY = config_1.config.adminKey;
const failedAttempts = new Map();
const authorize = ({ via }) => (req, res, next) => {
    const bearerToken = req.headers.authorization?.slice("Bearer ".length);
    const cookieToken = req.session.adminToken;
    const token = via === "cookie" ? cookieToken : bearerToken;
    const attempts = failedAttempts.get(req.ip) ?? 0;
    if (!ADMIN_KEY) {
        req.log.warn({ ip: req.ip }, `Blocked admin request because no admin key is configured`);
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (attempts > 5) {
        req.log.warn({ ip: req.ip, token: bearerToken }, `Blocked admin request due to too many failed attempts`);
        return res.status(401).json({ error: "Too many attempts" });
    }
    if (token && token === ADMIN_KEY) {
        return next();
    }
    req.log.warn({ ip: req.ip, attempts, invalidToken: String(token) }, `Attempted admin request with invalid token`);
    return handleFailedLogin(req, res);
};
exports.authorize = authorize;
function handleFailedLogin(req, res) {
    const attempts = failedAttempts.get(req.ip) ?? 0;
    const newAttempts = attempts + 1;
    failedAttempts.set(req.ip, newAttempts);
    if (req.accepts("json", "html") === "json") {
        return res.status(401).json({ error: "Unauthorized" });
    }
    delete req.session.adminToken;
    req.session.flash = { type: "error", message: `Invalid admin key.` };
    return res.redirect("/admin/login");
}
//# sourceMappingURL=auth.js.map
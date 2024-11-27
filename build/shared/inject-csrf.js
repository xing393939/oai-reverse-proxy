"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCsrfToken = exports.injectCsrfToken = void 0;
const csrf_csrf_1 = require("csrf-csrf");
const config_1 = require("../config");
const { generateToken, doubleCsrfProtection } = (0, csrf_csrf_1.doubleCsrf)({
    getSecret: () => config_1.SECRET_SIGNING_KEY,
    cookieName: "csrf",
    cookieOptions: {
        sameSite: "strict",
        path: "/",
        secure: !config_1.config.useInsecureCookies,
    },
    getTokenFromRequest: (req) => {
        const val = req.body["_csrf"] || req.query["_csrf"];
        delete req.body["_csrf"];
        return val;
    },
});
exports.checkCsrfToken = doubleCsrfProtection;
const injectCsrfToken = (req, res, next) => {
    const session = req.session;
    if (!session.csrf) {
        session.csrf = generateToken(res, req);
    }
    res.locals.csrfToken = session.csrf;
    next();
};
exports.injectCsrfToken = injectCsrfToken;
//# sourceMappingURL=inject-csrf.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withSession = void 0;
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_session_1 = __importDefault(require("express-session"));
const memorystore_1 = __importDefault(require("memorystore"));
const config_1 = require("../config");
const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
const cookieParserMiddleware = (0, cookie_parser_1.default)(config_1.SECRET_SIGNING_KEY);
const sessionMiddleware = (0, express_session_1.default)({
    secret: config_1.SECRET_SIGNING_KEY,
    resave: false,
    saveUninitialized: false,
    store: new ((0, memorystore_1.default)(express_session_1.default))({ checkPeriod: ONE_WEEK }),
    cookie: {
        sameSite: "strict",
        maxAge: ONE_WEEK,
        signed: true,
        secure: !config_1.config.useInsecureCookies,
    },
});
const withSession = [cookieParserMiddleware, sessionMiddleware];
exports.withSession = withSession;
//# sourceMappingURL=with-session.js.map
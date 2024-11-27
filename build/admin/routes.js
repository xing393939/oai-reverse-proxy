"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = __importStar(require("express"));
const cidr_1 = require("../shared/cidr");
const errors_1 = require("../shared/errors");
const inject_csrf_1 = require("../shared/inject-csrf");
const inject_locals_1 = require("../shared/inject-locals");
const with_session_1 = require("../shared/with-session");
const config_1 = require("../config");
const info_page_1 = require("../info-page");
const service_info_1 = require("../service-info");
const auth_1 = require("./auth");
const login_1 = require("./login");
const events_1 = require("./api/events");
const users_1 = require("./api/users");
const manage_1 = require("./web/manage");
const logger_1 = require("../logger");
const adminRouter = (0, express_1.Router)();
exports.adminRouter = adminRouter;
const whitelist = (0, cidr_1.createWhitelistMiddleware)("ADMIN_WHITELIST", config_1.config.adminWhitelist);
if (!whitelist.ranges.length && config_1.config.adminKey?.length) {
    logger_1.logger.error("ADMIN_WHITELIST is empty. No admin requests will be allowed. Set 0.0.0.0/0 to allow all.");
}
adminRouter.use(whitelist);
adminRouter.use(express_1.default.json({ limit: "20mb" }), express_1.default.urlencoded({ extended: true, limit: "20mb" }));
adminRouter.use(with_session_1.withSession);
adminRouter.use(inject_csrf_1.injectCsrfToken);
adminRouter.use("/users", (0, auth_1.authorize)({ via: "header" }), users_1.usersApiRouter);
adminRouter.use("/events", (0, auth_1.authorize)({ via: "header" }), events_1.eventsApiRouter);
adminRouter.use(inject_csrf_1.checkCsrfToken);
adminRouter.use(inject_locals_1.injectLocals);
adminRouter.use("/", login_1.loginRouter);
adminRouter.use("/manage", (0, auth_1.authorize)({ via: "cookie" }), manage_1.usersWebRouter);
adminRouter.use("/service-info", (0, auth_1.authorize)({ via: "cookie" }), (req, res) => {
    return res.send((0, info_page_1.renderPage)((0, service_info_1.buildInfo)(req.protocol + "://" + req.get("host"), true)));
});
adminRouter.use((err, req, res, _next) => {
    const data = { message: err.message, stack: err.stack };
    if (err instanceof errors_1.HttpError) {
        data.status = err.status;
        res.status(err.status);
        if (req.accepts(["html", "json"]) === "json") {
            return res.json({ error: data });
        }
        return res.render("admin_error", data);
    }
    else if (err.name === "ForbiddenError") {
        data.status = 403;
        if (err.message === "invalid csrf token") {
            data.message =
                "Invalid CSRF token; try refreshing the previous page before submitting again.";
        }
        return res.status(403).render("admin_error", { ...data, flash: null });
    }
    res.status(500).json({ error: data });
});
//# sourceMappingURL=routes.js.map
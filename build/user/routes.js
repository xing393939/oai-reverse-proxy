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
exports.userRouter = void 0;
const express_1 = __importStar(require("express"));
const inject_csrf_1 = require("../shared/inject-csrf");
const browse_images_1 = require("./web/browse-images");
const self_service_1 = require("./web/self-service");
const pow_captcha_1 = require("./web/pow-captcha");
const inject_locals_1 = require("../shared/inject-locals");
const with_session_1 = require("../shared/with-session");
const config_1 = require("../config");
const userRouter = (0, express_1.Router)();
exports.userRouter = userRouter;
userRouter.use(express_1.default.json({ limit: "1mb" }), express_1.default.urlencoded({ extended: true, limit: "1mb" }));
userRouter.use(with_session_1.withSession);
userRouter.use(inject_csrf_1.injectCsrfToken, inject_csrf_1.checkCsrfToken);
userRouter.use(inject_locals_1.injectLocals);
if (config_1.config.showRecentImages) {
    userRouter.use(browse_images_1.browseImagesRouter);
}
if (config_1.config.captchaMode !== "none") {
    userRouter.use("/captcha", pow_captcha_1.powRouter);
}
userRouter.use(self_service_1.selfServiceRouter);
userRouter.use((err, req, res, _next) => {
    const data = { message: err.message, stack: err.stack, status: 500 };
    if (req.accepts("json", "html") === "json") {
        const isCsrfError = err.message === "invalid csrf token";
        const message = isCsrfError
            ? "CSRF token mismatch; try refreshing the page"
            : err.message;
        return res.status(500).json({ error: message });
    }
    else {
        return res.status(500).render("user_error", { ...data, flash: null });
    }
});
//# sourceMappingURL=routes.js.map
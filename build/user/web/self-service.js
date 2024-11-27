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
exports.selfServiceRouter = void 0;
const express_1 = require("express");
const schema_1 = require("../../shared/users/schema");
const userStore = __importStar(require("../../shared/users/user-store"));
const errors_1 = require("../../shared/errors");
const utils_1 = require("../../shared/utils");
const config_1 = require("../../config");
const router = (0, express_1.Router)();
exports.selfServiceRouter = router;
router.use((req, res, next) => {
    if (req.session.userToken) {
        res.locals.currentSelfServiceUser =
            userStore.getUser(req.session.userToken) || null;
    }
    next();
});
router.get("/", (_req, res) => {
    res.redirect("/");
});
router.get("/lookup", (_req, res) => {
    const ipLimit = (res.locals.currentSelfServiceUser?.maxIps ?? config_1.config.maxIpsPerUser) || 0;
    res.render("user_lookup", {
        user: res.locals.currentSelfServiceUser,
        ipLimit,
    });
});
router.post("/lookup", (req, res) => {
    const token = req.body.token;
    const user = userStore.getUser(token);
    req.log.info({ token: truncateToken(token), success: !!user }, "User self-service lookup");
    if (!user) {
        req.session.flash = { type: "error", message: "Invalid user token." };
        return res.redirect("/user/lookup");
    }
    req.session.userToken = user.token;
    return res.redirect("/user/lookup");
});
router.post("/edit-nickname", (req, res) => {
    const existing = res.locals.currentSelfServiceUser;
    if (!existing) {
        throw new errors_1.ForbiddenError("Not logged in.");
    }
    else if (!config_1.config.allowNicknameChanges || existing.disabledAt) {
        throw new errors_1.ForbiddenError("Nickname changes are not allowed.");
    }
    else if (!config_1.config.maxIpsAutoBan && !existing.ip.includes(req.ip)) {
        throw new errors_1.ForbiddenError("Nickname changes are only allowed from registered IPs.");
    }
    const schema = schema_1.UserPartialSchema.pick({ nickname: true })
        .strict()
        .transform((v) => ({ nickname: (0, utils_1.sanitizeAndTrim)(v.nickname) }));
    const result = schema.safeParse(req.body);
    if (!result.success) {
        throw new errors_1.BadRequestError(result.error.message);
    }
    const newNickname = result.data.nickname || null;
    userStore.upsertUser({ token: existing.token, nickname: newNickname });
    req.session.flash = { type: "success", message: "Nickname updated." };
    return res.redirect("/user/lookup");
});
function truncateToken(token) {
    const sliceLength = Math.max(Math.floor(token.length / 8), 1);
    return `${token.slice(0, sliceLength)}...${token.slice(-sliceLength)}`;
}
//# sourceMappingURL=self-service.js.map
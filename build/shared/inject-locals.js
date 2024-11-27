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
exports.injectLocals = void 0;
const config_1 = require("../config");
const stats_1 = require("./stats");
const utils_1 = require("./utils");
const userStore = __importStar(require("./users/user-store"));
const injectLocals = (req, res, next) => {
    // config-related locals
    const quota = config_1.config.tokenQuota;
    const sumOfQuotas = Object.values(quota).reduce((a, b) => a + b, 0);
    res.locals.quotasEnabled = sumOfQuotas > 0;
    res.locals.quota = quota;
    res.locals.nextQuotaRefresh = userStore.getNextQuotaRefresh();
    res.locals.persistenceEnabled = config_1.config.gatekeeperStore !== "memory";
    res.locals.usersEnabled = config_1.config.gatekeeper === "user_token";
    res.locals.imageGenerationEnabled = config_1.config.allowedModelFamilies.some((f) => ["dall-e", "azure-dall-e"].includes(f));
    res.locals.showTokenCosts = config_1.config.showTokenCosts;
    res.locals.maxIps = config_1.config.maxIpsPerUser;
    // flash messages
    if (req.session.flash) {
        res.locals.flash = req.session.flash;
        delete req.session.flash;
    }
    else {
        res.locals.flash = null;
    }
    // view helpers
    res.locals.prettyTokens = stats_1.prettyTokens;
    res.locals.tokenCost = stats_1.getTokenCostUsd;
    res.locals.redactIp = utils_1.redactIp;
    next();
};
exports.injectLocals = injectLocals;
//# sourceMappingURL=inject-locals.js.map
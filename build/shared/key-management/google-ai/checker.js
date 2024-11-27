"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleAIKeyChecker = void 0;
const models_1 = require("../../models");
const network_1 = require("../../network");
const key_checker_base_1 = require("../key-checker-base");
const axios = (0, network_1.getAxiosInstance)();
const MIN_CHECK_INTERVAL = 3 * 1000; // 3 seconds
const KEY_CHECK_PERIOD = 3 * 60 * 60 * 1000; // 3 hours
const LIST_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
class GoogleAIKeyChecker extends key_checker_base_1.KeyCheckerBase {
    constructor(keys, updateKey) {
        super(keys, {
            service: "google-ai",
            keyCheckPeriod: KEY_CHECK_PERIOD,
            minCheckInterval: MIN_CHECK_INTERVAL,
            recurringChecksEnabled: false,
            updateKey,
        });
    }
    async testKeyOrFail(key) {
        const provisionedModels = await this.getProvisionedModels(key);
        const updates = {
            modelFamilies: provisionedModels,
        };
        this.updateKey(key.hash, updates);
        this.log.info({ key: key.hash, models: key.modelFamilies, ids: key.modelIds.length }, "Checked key.");
    }
    async getProvisionedModels(key) {
        const { data } = await axios.get(`${LIST_MODELS_URL}?pageSize=1000&key=${key.key}`);
        const models = data.models;
        const ids = new Set();
        const families = new Set();
        models.forEach(({ name }) => {
            families.add((0, models_1.getGoogleAIModelFamily)(name));
            ids.add(name);
        });
        const familiesArray = Array.from(families);
        this.updateKey(key.hash, {
            modelFamilies: familiesArray,
            modelIds: Array.from(ids),
        });
        return familiesArray;
    }
    handleAxiosError(key, error) {
        if (error.response && GoogleAIKeyChecker.errorIsGoogleAIError(error)) {
            const httpStatus = error.response.status;
            const { code, message, status, details } = error.response.data.error;
            switch (httpStatus) {
                case 400:
                    const reason = details?.[0]?.reason;
                    if (status === "INVALID_ARGUMENT" && reason === "API_KEY_INVALID") {
                        this.log.warn({ key: key.hash, reason, details }, "Key check returned API_KEY_INVALID error. Disabling key.");
                        this.updateKey(key.hash, { isDisabled: true, isRevoked: true });
                        return;
                    }
                    else if (status === "FAILED_PRECONDITION" &&
                        message.match(/please enable billing/i)) {
                        this.log.warn({ key: key.hash, message, details }, "Key check returned billing disabled error. Disabling key.");
                        this.updateKey(key.hash, { isDisabled: true, isRevoked: true });
                        return;
                    }
                    break;
                case 401:
                case 403:
                    this.log.warn({ key: key.hash, status, code, message, details }, "Key check returned Forbidden/Unauthorized error. Disabling key.");
                    this.updateKey(key.hash, { isDisabled: true, isRevoked: true });
                    return;
                case 429:
                    this.log.warn({ key: key.hash, status, code, message, details }, "Key is rate limited. Rechecking key in 1 minute.");
                    const next = Date.now() - (KEY_CHECK_PERIOD - 10 * 1000);
                    this.updateKey(key.hash, { lastChecked: next });
                    return;
            }
            this.log.error({ key: key.hash, status, code, message, details }, "Encountered unexpected error status while checking key. This may indicate a change in the API; please report this.");
            return this.updateKey(key.hash, { lastChecked: Date.now() });
        }
        this.log.error({ key: key.hash, error: error.message }, "Network error while checking key; trying this key again in a minute.");
        const oneMinute = 10 * 1000;
        const next = Date.now() - (KEY_CHECK_PERIOD - oneMinute);
        return this.updateKey(key.hash, { lastChecked: next });
    }
    static errorIsGoogleAIError(error) {
        const data = error.response?.data;
        return data?.error?.code || data?.error?.status;
    }
}
exports.GoogleAIKeyChecker = GoogleAIKeyChecker;
//# sourceMappingURL=checker.js.map
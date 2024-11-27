"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MistralAIKeyChecker = void 0;
const models_1 = require("../../models");
const network_1 = require("../../network");
const key_checker_base_1 = require("../key-checker-base");
const axios = (0, network_1.getAxiosInstance)();
const MIN_CHECK_INTERVAL = 3 * 1000; // 3 seconds
const KEY_CHECK_PERIOD = 60 * 60 * 1000; // 1 hour
const GET_MODELS_URL = "https://api.mistral.ai/v1/models";
class MistralAIKeyChecker extends key_checker_base_1.KeyCheckerBase {
    constructor(keys, updateKey) {
        super(keys, {
            service: "mistral-ai",
            keyCheckPeriod: KEY_CHECK_PERIOD,
            minCheckInterval: MIN_CHECK_INTERVAL,
            recurringChecksEnabled: false,
            updateKey,
        });
    }
    async testKeyOrFail(key) {
        // We only need to check for provisioned models on the initial check.
        const isInitialCheck = !key.lastChecked;
        if (isInitialCheck) {
            const provisionedModels = await this.getProvisionedModels(key);
            const updates = {
                modelFamilies: provisionedModels,
            };
            this.updateKey(key.hash, updates);
        }
        this.log.info({ key: key.hash, models: key.modelFamilies }, "Checked key.");
    }
    async getProvisionedModels(key) {
        const opts = { headers: MistralAIKeyChecker.getHeaders(key) };
        const { data } = await axios.get(GET_MODELS_URL, opts);
        const models = data.data;
        const families = new Set();
        models.forEach(({ id }) => families.add((0, models_1.getMistralAIModelFamily)(id)));
        // We want to update the key's model families here, but we don't want to
        // update its `lastChecked` timestamp because we need to let the liveness
        // check run before we can consider the key checked.
        const familiesArray = [...families];
        const keyFromPool = this.keys.find((k) => k.hash === key.hash);
        this.updateKey(key.hash, {
            modelFamilies: familiesArray,
            lastChecked: keyFromPool.lastChecked,
        });
        return familiesArray;
    }
    handleAxiosError(key, error) {
        if (error.response && MistralAIKeyChecker.errorIsMistralAIError(error)) {
            const { status, data } = error.response;
            if ([401, 403].includes(status)) {
                this.log.warn({ key: key.hash, error: data, status }, "Key is invalid or revoked. Disabling key.");
                this.updateKey(key.hash, {
                    isDisabled: true,
                    isRevoked: true,
                    modelFamilies: ["mistral-tiny"],
                });
            }
            else {
                this.log.error({ key: key.hash, status, error: data }, "Encountered unexpected error status while checking key. This may indicate a change in the API; please report this.");
                this.updateKey(key.hash, { lastChecked: Date.now() });
            }
            return;
        }
        this.log.error({ key: key.hash, error: error.message }, "Network error while checking key; trying this key again in a minute.");
        const oneMinute = 60 * 1000;
        const next = Date.now() - (KEY_CHECK_PERIOD - oneMinute);
        this.updateKey(key.hash, { lastChecked: next });
    }
    static errorIsMistralAIError(error) {
        const data = error.response?.data;
        return data?.message && data?.request_id;
    }
    static getHeaders(key) {
        return {
            Authorization: `Bearer ${key.key}`,
        };
    }
}
exports.MistralAIKeyChecker = MistralAIKeyChecker;
//# sourceMappingURL=checker.js.map
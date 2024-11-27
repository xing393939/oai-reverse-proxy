"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GcpKeyProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../../../config");
const logger_1 = require("../../../logger");
const errors_1 = require("../../errors");
const models_1 = require("../../models");
const __1 = require("..");
const prioritize_keys_1 = require("../prioritize-keys");
const checker_1 = require("./checker");
/**
 * Upon being rate limited, a key will be locked out for this many milliseconds
 * while we wait for other concurrent requests to finish.
 */
const RATE_LIMIT_LOCKOUT = 4000;
/**
 * Upon assigning a key, we will wait this many milliseconds before allowing it
 * to be used again. This is to prevent the queue from flooding a key with too
 * many requests while we wait to learn whether previous ones succeeded.
 */
const KEY_REUSE_DELAY = 500;
class GcpKeyProvider {
    service = "gcp";
    keys = [];
    checker;
    log = logger_1.logger.child({ module: "key-provider", service: this.service });
    constructor() {
        const keyConfig = config_1.config.gcpCredentials?.trim();
        if (!keyConfig) {
            this.log.warn("GCP_CREDENTIALS is not set. GCP API will not be available.");
            return;
        }
        let bareKeys;
        bareKeys = [...new Set(keyConfig.split(",").map((k) => k.trim()))];
        for (const key of bareKeys) {
            const newKey = {
                key,
                service: this.service,
                modelFamilies: ["gcp-claude"],
                isDisabled: false,
                isRevoked: false,
                promptCount: 0,
                lastUsed: 0,
                rateLimitedAt: 0,
                rateLimitedUntil: 0,
                hash: `gcp-${crypto_1.default
                    .createHash("sha256")
                    .update(key)
                    .digest("hex")
                    .slice(0, 8)}`,
                lastChecked: 0,
                sonnetEnabled: true,
                haikuEnabled: false,
                sonnet35Enabled: false,
                accessToken: "",
                accessTokenExpiresAt: 0,
                ["gcp-claudeTokens"]: 0,
                ["gcp-claude-opusTokens"]: 0,
            };
            this.keys.push(newKey);
        }
        this.log.info({ keyCount: this.keys.length }, "Loaded GCP keys.");
    }
    init() {
        if (config_1.config.checkKeys) {
            this.checker = new checker_1.GcpKeyChecker(this.keys, this.update.bind(this));
            this.checker.start();
        }
    }
    list() {
        return this.keys.map((k) => Object.freeze({ ...k, key: undefined }));
    }
    get(model) {
        const neededFamily = (0, models_1.getGcpModelFamily)(model);
        // this is a horrible mess
        // each of these should be separate model families, but adding model
        // families is not low enough friction for the rate at which gcp claude
        // model variants are added.
        const needsSonnet35 = model.includes("claude-3-5-sonnet") && neededFamily === "gcp-claude";
        const needsSonnet = !needsSonnet35 &&
            model.includes("sonnet") &&
            neededFamily === "gcp-claude";
        const needsHaiku = model.includes("haiku") && neededFamily === "gcp-claude";
        const availableKeys = this.keys.filter((k) => {
            return (!k.isDisabled &&
                (k.sonnetEnabled || !needsSonnet) && // sonnet and haiku are both under gcp-claude, while opus is not
                (k.haikuEnabled || !needsHaiku) &&
                (k.sonnet35Enabled || !needsSonnet35) &&
                k.modelFamilies.includes(neededFamily));
        });
        this.log.debug({
            model,
            neededFamily,
            needsSonnet,
            needsHaiku,
            needsSonnet35,
            availableKeys: availableKeys.length,
            totalKeys: this.keys.length,
        }, "Selecting GCP key");
        if (availableKeys.length === 0) {
            throw new errors_1.PaymentRequiredError(`No GCP keys available for model ${model}`);
        }
        const selectedKey = (0, prioritize_keys_1.prioritizeKeys)(availableKeys)[0];
        selectedKey.lastUsed = Date.now();
        this.throttle(selectedKey.hash);
        return { ...selectedKey };
    }
    disable(key) {
        const keyFromPool = this.keys.find((k) => k.hash === key.hash);
        if (!keyFromPool || keyFromPool.isDisabled)
            return;
        keyFromPool.isDisabled = true;
        this.log.warn({ key: key.hash }, "Key disabled");
    }
    update(hash, update) {
        const keyFromPool = this.keys.find((k) => k.hash === hash);
        Object.assign(keyFromPool, { lastChecked: Date.now(), ...update });
    }
    available() {
        return this.keys.filter((k) => !k.isDisabled).length;
    }
    incrementUsage(hash, model, tokens) {
        const key = this.keys.find((k) => k.hash === hash);
        if (!key)
            return;
        key.promptCount++;
        key[`${(0, models_1.getGcpModelFamily)(model)}Tokens`] += tokens;
    }
    getLockoutPeriod = (0, __1.createGenericGetLockoutPeriod)(() => this.keys);
    /**
     * This is called when we receive a 429, which means there are already five
     * concurrent requests running on this key. We don't have any information on
     * when these requests will resolve, so all we can do is wait a bit and try
     * again. We will lock the key for 2 seconds after getting a 429 before
     * retrying in order to give the other requests a chance to finish.
     */
    markRateLimited(keyHash) {
        this.log.debug({ key: keyHash }, "Key rate limited");
        const key = this.keys.find((k) => k.hash === keyHash);
        const now = Date.now();
        key.rateLimitedAt = now;
        key.rateLimitedUntil = now + RATE_LIMIT_LOCKOUT;
    }
    recheck() {
        this.keys.forEach(({ hash }) => this.update(hash, { lastChecked: 0, isDisabled: false, isRevoked: false }));
        this.checker?.scheduleNextCheck();
    }
    /**
     * Applies a short artificial delay to the key upon dequeueing, in order to
     * prevent it from being immediately assigned to another request before the
     * current one can be dispatched.
     **/
    throttle(hash) {
        const now = Date.now();
        const key = this.keys.find((k) => k.hash === hash);
        const currentRateLimit = key.rateLimitedUntil;
        const nextRateLimit = now + KEY_REUSE_DELAY;
        key.rateLimitedAt = now;
        key.rateLimitedUntil = Math.max(currentRateLimit, nextRateLimit);
    }
}
exports.GcpKeyProvider = GcpKeyProvider;
//# sourceMappingURL=provider.js.map
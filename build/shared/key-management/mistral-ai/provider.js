"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MistralAIKeyProvider = void 0;
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
const RATE_LIMIT_LOCKOUT = 2000;
/**
 * Upon assigning a key, we will wait this many milliseconds before allowing it
 * to be used again. This is to prevent the queue from flooding a key with too
 * many requests while we wait to learn whether previous ones succeeded.
 */
const KEY_REUSE_DELAY = 500;
class MistralAIKeyProvider {
    service = "mistral-ai";
    keys = [];
    checker;
    log = logger_1.logger.child({ module: "key-provider", service: this.service });
    constructor() {
        const keyConfig = config_1.config.mistralAIKey?.trim();
        if (!keyConfig) {
            this.log.warn("MISTRAL_AI_KEY is not set. Mistral AI API will not be available.");
            return;
        }
        let bareKeys;
        bareKeys = [...new Set(keyConfig.split(",").map((k) => k.trim()))];
        for (const key of bareKeys) {
            const newKey = {
                key,
                service: this.service,
                modelFamilies: [
                    "mistral-tiny",
                    "mistral-small",
                    "mistral-medium",
                    "mistral-large",
                ],
                isDisabled: false,
                isRevoked: false,
                promptCount: 0,
                lastUsed: 0,
                rateLimitedAt: 0,
                rateLimitedUntil: 0,
                hash: `mst-${crypto_1.default
                    .createHash("sha256")
                    .update(key)
                    .digest("hex")
                    .slice(0, 8)}`,
                lastChecked: 0,
                "mistral-tinyTokens": 0,
                "mistral-smallTokens": 0,
                "mistral-mediumTokens": 0,
                "mistral-largeTokens": 0,
            };
            this.keys.push(newKey);
        }
        this.log.info({ keyCount: this.keys.length }, "Loaded Mistral AI keys.");
    }
    init() {
        if (config_1.config.checkKeys) {
            const updateFn = this.update.bind(this);
            this.checker = new checker_1.MistralAIKeyChecker(this.keys, updateFn);
            this.checker.start();
        }
    }
    list() {
        return this.keys.map((k) => Object.freeze({ ...k, key: undefined }));
    }
    get(_model) {
        const availableKeys = this.keys.filter((k) => !k.isDisabled);
        if (availableKeys.length === 0) {
            throw new errors_1.HttpError(402, "No Mistral AI keys available");
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
        const family = (0, models_1.getMistralAIModelFamily)(model);
        key[`${family}Tokens`] += tokens;
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
    recheck() { }
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
exports.MistralAIKeyProvider = MistralAIKeyProvider;
//# sourceMappingURL=provider.js.map
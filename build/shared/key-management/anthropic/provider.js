"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicKeyProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const __1 = require("..");
const config_1 = require("../../../config");
const logger_1 = require("../../../logger");
const models_1 = require("../../models");
const checker_1 = require("./checker");
const errors_1 = require("../../errors");
/**
 * Selection priority for Anthropic keys. Aims to maximize throughput by
 * saturating concurrency-limited keys first, then trying keys with increasingly
 * strict rate limits. Free keys have very limited throughput and are used last.
 */
const TIER_PRIORITY = [
    "unknown",
    "scale",
    "build_4",
    "build_3",
    "build_2",
    "build_1",
    "free",
];
/**
 * Upon being rate limited, a Scale-tier key will be locked out for this many
 * milliseconds while we wait for other concurrent requests to finish.
 */
const SCALE_RATE_LIMIT_LOCKOUT = 2000;
/**
 * Upon being rate limited, a Build-tier key will be locked out for this many
 * milliseconds while we wait for the per-minute rate limit to reset. Because
 * the reset provided in the headers specifies the time for the full quota to
 * become available, the key may become available before that time.
 */
const BUILD_RATE_LIMIT_LOCKOUT = 10000;
/**
 * Upon assigning a key, we will wait this many milliseconds before allowing it
 * to be used again. This is to prevent the queue from flooding a key with too
 * many requests while we wait to learn whether previous ones succeeded.
 */
const KEY_REUSE_DELAY = 500;
class AnthropicKeyProvider {
    service = "anthropic";
    keys = [];
    checker;
    log = logger_1.logger.child({ module: "key-provider", service: this.service });
    constructor() {
        const keyConfig = config_1.config.anthropicKey?.trim();
        if (!keyConfig) {
            this.log.warn("ANTHROPIC_KEY is not set. Anthropic API will not be available.");
            return;
        }
        let bareKeys;
        bareKeys = [...new Set(keyConfig.split(",").map((k) => k.trim()))];
        for (const key of bareKeys) {
            const newKey = {
                key,
                service: this.service,
                modelFamilies: ["claude", "claude-opus"],
                isDisabled: false,
                isOverQuota: false,
                isRevoked: false,
                isPozzed: false,
                allowsMultimodality: true,
                promptCount: 0,
                lastUsed: 0,
                rateLimitedAt: 0,
                rateLimitedUntil: 0,
                requiresPreamble: false,
                hash: `ant-${crypto_1.default
                    .createHash("sha256")
                    .update(key)
                    .digest("hex")
                    .slice(0, 8)}`,
                lastChecked: 0,
                claudeTokens: 0,
                "claude-opusTokens": 0,
                tier: "unknown",
            };
            this.keys.push(newKey);
        }
        this.log.info({ keyCount: this.keys.length }, "Loaded Anthropic keys.");
    }
    init() {
        if (config_1.config.checkKeys) {
            this.checker = new checker_1.AnthropicKeyChecker(this.keys, this.update.bind(this));
            this.checker.start();
        }
    }
    list() {
        return this.keys.map((k) => Object.freeze({ ...k, key: undefined }));
    }
    get(rawModel) {
        this.log.debug({ model: rawModel }, "Selecting key");
        const needsMultimodal = rawModel.endsWith("-multimodal");
        const availableKeys = this.keys.filter((k) => {
            return !k.isDisabled && (!needsMultimodal || k.allowsMultimodality);
        });
        if (availableKeys.length === 0) {
            throw new errors_1.PaymentRequiredError(needsMultimodal
                ? "No multimodal Anthropic keys available. Please disable multimodal input (such as inline images) and try again."
                : "No Anthropic keys available.");
        }
        // Select a key, from highest priority to lowest priority:
        // 1. Keys which are not rate limit locked
        // 2. Keys with the highest tier
        // 3. Keys which are not pozzed
        // 4. Keys which have not been used in the longest time
        const now = Date.now();
        const keysByPriority = availableKeys.sort((a, b) => {
            const aLockoutPeriod = getKeyLockout(a);
            const bLockoutPeriod = getKeyLockout(b);
            const aRateLimited = now - a.rateLimitedAt < aLockoutPeriod;
            const bRateLimited = now - b.rateLimitedAt < bLockoutPeriod;
            if (aRateLimited && !bRateLimited)
                return 1;
            if (!aRateLimited && bRateLimited)
                return -1;
            const aTierIndex = TIER_PRIORITY.indexOf(a.tier);
            const bTierIndex = TIER_PRIORITY.indexOf(b.tier);
            if (aTierIndex > bTierIndex)
                return -1;
            if (a.isPozzed && !b.isPozzed)
                return 1;
            if (!a.isPozzed && b.isPozzed)
                return -1;
            return a.lastUsed - b.lastUsed;
        });
        const selectedKey = keysByPriority[0];
        selectedKey.lastUsed = now;
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
        key[`${(0, models_1.getClaudeModelFamily)(model)}Tokens`] += tokens;
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
        key.rateLimitedUntil = now + SCALE_RATE_LIMIT_LOCKOUT;
    }
    recheck() {
        this.keys.forEach((key) => {
            this.update(key.hash, {
                isPozzed: false,
                isOverQuota: false,
                isDisabled: false,
                isRevoked: false,
                lastChecked: 0,
            });
        });
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
exports.AnthropicKeyProvider = AnthropicKeyProvider;
function getKeyLockout(key) {
    return ["scale", "unknown"].includes(key.tier)
        ? SCALE_RATE_LIMIT_LOCKOUT
        : BUILD_RATE_LIMIT_LOCKOUT;
}
//# sourceMappingURL=provider.js.map
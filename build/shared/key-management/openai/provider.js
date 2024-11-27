"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIKeyProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../../../config");
const logger_1 = require("../../../logger");
const models_1 = require("../../models");
const errors_1 = require("../../errors");
const checker_1 = require("./checker");
const prioritize_keys_1 = require("../prioritize-keys");
/**
 * Upon assigning a key, we will wait this many milliseconds before allowing it
 * to be used again. This is to prevent the queue from flooding a key with too
 * many requests while we wait to learn whether previous ones succeeded.
 */
const KEY_REUSE_DELAY = 1000;
class OpenAIKeyProvider {
    service = "openai";
    keys = [];
    checker;
    log = logger_1.logger.child({ module: "key-provider", service: this.service });
    constructor() {
        const keyString = config_1.config.openaiKey?.trim();
        if (!keyString) {
            this.log.warn("OPENAI_KEY is not set. OpenAI API will not be available.");
            return;
        }
        let bareKeys;
        bareKeys = keyString.split(",").map((k) => k.trim());
        bareKeys = [...new Set(bareKeys)];
        for (const k of bareKeys) {
            const newKey = {
                key: k,
                service: "openai",
                modelFamilies: [
                    "turbo",
                    "gpt4",
                    "gpt4-turbo",
                    "gpt4o",
                ],
                isTrial: false,
                isDisabled: false,
                isRevoked: false,
                isOverQuota: false,
                lastUsed: 0,
                lastChecked: 0,
                promptCount: 0,
                hash: `oai-${crypto_1.default
                    .createHash("sha256")
                    .update(k)
                    .digest("hex")
                    .slice(0, 8)}`,
                rateLimitedAt: 0,
                rateLimitedUntil: 0,
                rateLimitRequestsReset: 0,
                rateLimitTokensReset: 0,
                turboTokens: 0,
                gpt4Tokens: 0,
                "gpt4-32kTokens": 0,
                "gpt4-turboTokens": 0,
                gpt4oTokens: 0,
                "o1Tokens": 0,
                "o1-miniTokens": 0,
                "dall-eTokens": 0,
                modelIds: [],
            };
            this.keys.push(newKey);
        }
        this.log.info({ keyCount: this.keys.length }, "Loaded OpenAI keys.");
    }
    init() {
        if (config_1.config.checkKeys) {
            const cloneFn = this.clone.bind(this);
            const updateFn = this.update.bind(this);
            this.checker = new checker_1.OpenAIKeyChecker(this.keys, cloneFn, updateFn);
            this.checker.start();
        }
    }
    /**
     * Returns a list of all keys, with the key field removed.
     * Don't mutate returned keys, use a KeyPool method instead.
     **/
    list() {
        return this.keys.map((key) => Object.freeze({ ...key, key: undefined }));
    }
    get(requestModel) {
        let model = requestModel;
        const neededFamily = (0, models_1.getOpenAIModelFamily)(model);
        const excludeTrials = model === "text-embedding-ada-002";
        const availableKeys = this.keys.filter(
        // Allow keys which
        (key) => !key.isDisabled && // are not disabled
            key.modelFamilies.includes(neededFamily) && // have access to the model family we need
            (!excludeTrials || !key.isTrial) && // and are not trials if we don't want them
            (!config_1.config.checkKeys || key.modelIds.includes(model)) // and have the specific snapshot we need
        );
        if (availableKeys.length === 0) {
            throw new errors_1.PaymentRequiredError(`No OpenAI keys available for model ${model}`);
        }
        const keysByPriority = (0, prioritize_keys_1.prioritizeKeys)(availableKeys, (a, b) => +a.isTrial - +b.isTrial);
        const selectedKey = keysByPriority[0];
        selectedKey.lastUsed = Date.now();
        this.throttle(selectedKey.hash);
        return { ...selectedKey };
    }
    /** Called by the key checker to update key information. */
    update(keyHash, update) {
        const keyFromPool = this.keys.find((k) => k.hash === keyHash);
        Object.assign(keyFromPool, { lastChecked: Date.now(), ...update });
    }
    /** Called by the key checker to create clones of keys for the given orgs. */
    clone(keyHash, newOrgIds) {
        const keyFromPool = this.keys.find((k) => k.hash === keyHash);
        const clones = newOrgIds.map((orgId) => {
            const clone = {
                ...keyFromPool,
                organizationId: orgId,
                isDisabled: false,
                isRevoked: false,
                isOverQuota: false,
                hash: `oai-${crypto_1.default
                    .createHash("sha256")
                    .update(keyFromPool.key + orgId)
                    .digest("hex")
                    .slice(0, 8)}`,
                lastChecked: 0, // Force re-check in case the org has different models
            };
            this.log.info({ cloneHash: clone.hash, parentHash: keyFromPool.hash, orgId }, "Cloned organization key");
            return clone;
        });
        this.keys.push(...clones);
    }
    /** Disables a key, or does nothing if the key isn't in this pool. */
    disable(key) {
        const keyFromPool = this.keys.find((k) => k.hash === key.hash);
        if (!keyFromPool || keyFromPool.isDisabled)
            return;
        this.update(key.hash, { isDisabled: true });
        this.log.warn({ key: key.hash }, "Key disabled");
    }
    available() {
        return this.keys.filter((k) => !k.isDisabled).length;
    }
    /**
     * Given a model, returns the period until a key will be available to service
     * the request, or returns 0 if a key is ready immediately.
     */
    getLockoutPeriod(family) {
        // TODO: this is really inefficient on servers with large key pools and we
        // are calling it every 50ms, per model family.
        const activeKeys = this.keys.filter((key) => !key.isDisabled && key.modelFamilies.includes(family));
        // Don't lock out if there are no keys available or the queue will stall.
        // Just let it through so the add-key middleware can throw an error.
        if (activeKeys.length === 0)
            return 0;
        // A key is rate-limited if its `rateLimitedAt` plus the greater of its
        // `rateLimitRequestsReset` and `rateLimitTokensReset` is after the
        // current time.
        // If there are any keys that are not rate-limited, we can fulfill requests.
        const now = Date.now();
        const rateLimitedKeys = activeKeys.filter((key) => {
            const resetTime = Math.max(key.rateLimitRequestsReset, key.rateLimitTokensReset);
            return now < key.rateLimitedAt + Math.min(20000, resetTime);
        }).length;
        const anyNotRateLimited = rateLimitedKeys < activeKeys.length;
        if (anyNotRateLimited) {
            return 0;
        }
        // If all keys are rate-limited, return the time until the first key is
        // ready. We don't want to wait longer than 10 seconds because rate limits
        // are a rolling window and keys may become available sooner than the stated
        // reset time.
        return Math.min(...activeKeys.map((key) => {
            const resetTime = Math.max(key.rateLimitRequestsReset, key.rateLimitTokensReset);
            return key.rateLimitedAt + Math.min(20000, resetTime) - now;
        }));
    }
    markRateLimited(keyHash) {
        this.log.debug({ key: keyHash }, "Key rate limited");
        const key = this.keys.find((k) => k.hash === keyHash);
        const now = Date.now();
        key.rateLimitedAt = now;
        // Most OpenAI reqeuests will provide a `x-ratelimit-reset-requests` header
        // header telling us when to try again which will be set in a call to
        // `updateRateLimits`.  These values below are fallbacks in case the header
        // is not provided.
        key.rateLimitRequestsReset = 10000;
        key.rateLimitedUntil = now + key.rateLimitRequestsReset;
    }
    incrementUsage(keyHash, model, tokens) {
        const key = this.keys.find((k) => k.hash === keyHash);
        if (!key)
            return;
        key.promptCount++;
        key[`${(0, models_1.getOpenAIModelFamily)(model)}Tokens`] += tokens;
    }
    updateRateLimits(keyHash, headers) {
        const key = this.keys.find((k) => k.hash === keyHash);
        const requestsReset = headers["x-ratelimit-reset-requests"];
        const tokensReset = headers["x-ratelimit-reset-tokens"];
        if (typeof requestsReset === "string") {
            key.rateLimitRequestsReset = getResetDurationMillis(requestsReset);
        }
        if (typeof tokensReset === "string") {
            key.rateLimitTokensReset = getResetDurationMillis(tokensReset);
        }
        if (!requestsReset && !tokensReset) {
            this.log.warn({ key: key.hash }, `No ratelimit headers; skipping update`);
            return;
        }
        const { rateLimitedAt, rateLimitRequestsReset, rateLimitTokensReset } = key;
        const rateLimitedUntil = rateLimitedAt + Math.max(rateLimitRequestsReset, rateLimitTokensReset);
        if (rateLimitedUntil > Date.now()) {
            key.rateLimitedUntil = rateLimitedUntil;
        }
    }
    recheck() {
        this.keys.forEach((key) => {
            this.update(key.hash, {
                isRevoked: false,
                isOverQuota: false,
                isDisabled: false,
                lastChecked: 0,
            });
        });
        this.checker?.scheduleNextCheck();
    }
    /**
     * Called when a key is selected for a request, briefly disabling it to
     * avoid spamming the API with requests while we wait to learn whether this
     * key is already rate limited.
     */
    throttle(hash) {
        const now = Date.now();
        const key = this.keys.find((k) => k.hash === hash);
        const currentRateLimit = Math.max(key.rateLimitRequestsReset, key.rateLimitTokensReset) +
            key.rateLimitedAt;
        const nextRateLimit = now + KEY_REUSE_DELAY;
        // Don't throttle if the key is already naturally rate limited.
        if (currentRateLimit > nextRateLimit)
            return;
        key.rateLimitedAt = Date.now();
        key.rateLimitRequestsReset = KEY_REUSE_DELAY;
        key.rateLimitedUntil = Date.now() + KEY_REUSE_DELAY;
    }
}
exports.OpenAIKeyProvider = OpenAIKeyProvider;
// wip
function calculateRequestsPerMinute(headers) {
    const requestsLimit = headers["x-ratelimit-limit-requests"];
    const requestsReset = headers["x-ratelimit-reset-requests"];
    if (typeof requestsLimit !== "string" || typeof requestsReset !== "string") {
        return 0;
    }
    const limit = parseInt(requestsLimit, 10);
    const reset = getResetDurationMillis(requestsReset);
    // If `reset` is less than one minute, OpenAI specifies the `limit` as an
    // integer representing requests per minute.  Otherwise it actually means the
    // requests per day.
    const isPerMinute = reset < 60000;
    if (isPerMinute)
        return limit;
    return limit / 1440;
}
/**
 * Converts reset string ("14m25s", "21.0032s", "14ms" or "21ms") to a number of
 * milliseconds.
 **/
function getResetDurationMillis(resetDuration) {
    const match = resetDuration?.match(/(?:(\d+)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?/);
    if (match) {
        const [, minutes, seconds, milliseconds] = match.map(Number);
        const minutesToMillis = (minutes || 0) * 60 * 1000;
        const secondsToMillis = (seconds || 0) * 1000;
        const millisecondsValue = milliseconds || 0;
        return minutesToMillis + secondsToMillis + millisecondsValue;
    }
    return 0;
}
//# sourceMappingURL=provider.js.map
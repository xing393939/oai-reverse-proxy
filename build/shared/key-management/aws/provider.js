"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsBedrockKeyProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../../../config");
const logger_1 = require("../../../logger");
const models_1 = require("../../models");
const __1 = require("..");
const prioritize_keys_1 = require("../prioritize-keys");
const checker_1 = require("./checker");
/**
 * Upon being rate limited, a key will be locked out for this many milliseconds
 * while we wait for other concurrent requests to finish.
 */
const RATE_LIMIT_LOCKOUT = 5000;
/**
 * Upon assigning a key, we will wait this many milliseconds before allowing it
 * to be used again. This is to prevent the queue from flooding a key with too
 * many requests while we wait to learn whether previous ones succeeded.
 */
const KEY_REUSE_DELAY = 250;
class AwsBedrockKeyProvider {
    service = "aws";
    keys = [];
    checker;
    log = logger_1.logger.child({ module: "key-provider", service: this.service });
    constructor() {
        const keyConfig = config_1.config.awsCredentials?.trim();
        if (!keyConfig) {
            this.log.warn("AWS_CREDENTIALS is not set. AWS Bedrock API will not be available.");
            return;
        }
        let bareKeys;
        bareKeys = [...new Set(keyConfig.split(",").map((k) => k.trim()))];
        for (const key of bareKeys) {
            const newKey = {
                key,
                service: this.service,
                modelFamilies: ["aws-claude"],
                isDisabled: false,
                isRevoked: false,
                promptCount: 0,
                lastUsed: 0,
                rateLimitedAt: 0,
                rateLimitedUntil: 0,
                awsLoggingStatus: "unknown",
                hash: `aws-${crypto_1.default
                    .createHash("sha256")
                    .update(key)
                    .digest("hex")
                    .slice(0, 8)}`,
                lastChecked: 0,
                modelIds: ["anthropic.claude-3-sonnet-20240229-v1:0"],
                inferenceProfileIds: [],
                ["aws-claudeTokens"]: 0,
                ["aws-claude-opusTokens"]: 0,
                ["aws-mistral-tinyTokens"]: 0,
                ["aws-mistral-smallTokens"]: 0,
                ["aws-mistral-mediumTokens"]: 0,
                ["aws-mistral-largeTokens"]: 0,
            };
            this.keys.push(newKey);
        }
        this.log.info({ keyCount: this.keys.length }, "Loaded AWS Bedrock keys.");
    }
    init() {
        if (config_1.config.checkKeys) {
            this.checker = new checker_1.AwsKeyChecker(this.keys, this.update.bind(this));
            this.checker.start();
        }
    }
    list() {
        return this.keys.map((k) => Object.freeze({ ...k, key: undefined }));
    }
    get(model) {
        let neededVariantId = model;
        // This function accepts both Anthropic/Mistral IDs and AWS IDs.
        // Generally all AWS model IDs are supersets of the original vendor IDs.
        // Claude 2 is the only model that breaks this convention; Anthropic calls
        // it claude-2 but AWS calls it claude-v2.
        if (model.includes("claude-2"))
            neededVariantId = "claude-v2";
        const neededFamily = (0, models_1.getAwsBedrockModelFamily)(model);
        let availableKeys = this.keys.filter((k) => {
            // Select keys which
            return (
            // are enabled
            !k.isDisabled &&
                // are not logged, unless policy allows it
                (config_1.config.allowAwsLogging || k.awsLoggingStatus !== "enabled") &&
                // have access to the model family we need
                k.modelFamilies.includes(neededFamily) &&
                // have access to the specific variant we need
                k.modelIds.some((m) => m.includes(neededVariantId)));
        });
        this.log.debug({
            requestedModel: model,
            selectedVariant: neededVariantId,
            selectedFamily: neededFamily,
            totalKeys: this.keys.length,
            availableKeys: availableKeys.length,
        }, "Selecting AWS key");
        if (availableKeys.length === 0) {
            /*throw new PaymentRequiredError(
              `No AWS Bedrock keys available for model ${model}`
            );*/
            availableKeys = this.keys;
        }
        /**
         * Comparator for prioritizing keys on inference profile compatibility.
         * Requests made via inference profiles have higher rate limits so we want
         * to use keys with compatible inference profiles first.
         */
        const hasInferenceProfile = (a, b) => {
            const aMatch = +a.inferenceProfileIds.some((p) => p.includes(model));
            const bMatch = +b.inferenceProfileIds.some((p) => p.includes(model));
            return aMatch - bMatch;
        };
        const selectedKey = (0, prioritize_keys_1.prioritizeKeys)(availableKeys, hasInferenceProfile)[0];
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
        key[`${(0, models_1.getAwsBedrockModelFamily)(model)}Tokens`] += tokens;
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
exports.AwsBedrockKeyProvider = AwsBedrockKeyProvider;
//# sourceMappingURL=provider.js.map
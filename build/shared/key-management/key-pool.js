"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyPool = void 0;
const crypto_1 = __importDefault(require("crypto"));
const os_1 = __importDefault(require("os"));
const node_schedule_1 = __importDefault(require("node-schedule"));
const config_1 = require("../../config");
const logger_1 = require("../../logger");
const models_1 = require("../models");
const provider_1 = require("./anthropic/provider");
const provider_2 = require("./openai/provider");
const provider_3 = require("./google-ai/provider");
const provider_4 = require("./aws/provider");
const provider_5 = require("./gcp/provider");
const provider_6 = require("./azure/provider");
const provider_7 = require("./mistral-ai/provider");
class KeyPool {
    keyProviders = [];
    recheckJobs = {
        openai: null,
    };
    constructor() {
        this.keyProviders.push(new provider_2.OpenAIKeyProvider());
        this.keyProviders.push(new provider_1.AnthropicKeyProvider());
        this.keyProviders.push(new provider_3.GoogleAIKeyProvider());
        this.keyProviders.push(new provider_7.MistralAIKeyProvider());
        this.keyProviders.push(new provider_4.AwsBedrockKeyProvider());
        this.keyProviders.push(new provider_5.GcpKeyProvider());
        this.keyProviders.push(new provider_6.AzureOpenAIKeyProvider());
    }
    init() {
        this.keyProviders.forEach((provider) => provider.init());
        const availableKeys = this.available("all");
        if (availableKeys === 0) {
            throw new Error("No keys loaded. Ensure that at least one key is configured.");
        }
        this.scheduleRecheck();
    }
    get(model, service, multimodal) {
        // hack for some claude requests needing keys with particular permissions
        // even though they use the same models as the non-multimodal requests
        if (multimodal) {
            model += "-multimodal";
        }
        const queryService = service || this.getServiceForModel(model);
        return this.getKeyProvider(queryService).get(model);
    }
    list() {
        return this.keyProviders.flatMap((provider) => provider.list());
    }
    /**
     * Marks a key as disabled for a specific reason. `revoked` should be used
     * to indicate a key that can never be used again, while `quota` should be
     * used to indicate a key that is still valid but has exceeded its quota.
     */
    disable(key, reason) {
        const service = this.getKeyProvider(key.service);
        service.disable(key);
        service.update(key.hash, { isRevoked: reason === "revoked" });
        if (service instanceof provider_2.OpenAIKeyProvider ||
            service instanceof provider_1.AnthropicKeyProvider) {
            service.update(key.hash, { isOverQuota: reason === "quota" });
        }
    }
    /**
     * Updates a key in the keypool with the given properties.
     *
     * Be aware that the `key` argument may not be the same object instance as the
     * one in the keypool (such as if it is a clone received via `KeyPool.get` in
     * which case you are responsible for updating your clone with the new
     * properties.
     */
    update(key, props) {
        const service = this.getKeyProvider(key.service);
        service.update(key.hash, props);
    }
    available(model = "all") {
        return this.keyProviders.reduce((sum, provider) => {
            const includeProvider = model === "all" || this.getServiceForModel(model) === provider.service;
            return sum + (includeProvider ? provider.available() : 0);
        }, 0);
    }
    incrementUsage(key, model, tokens) {
        const provider = this.getKeyProvider(key.service);
        provider.incrementUsage(key.hash, model, tokens);
    }
    getLockoutPeriod(family) {
        const service = models_1.MODEL_FAMILY_SERVICE[family];
        return this.getKeyProvider(service).getLockoutPeriod(family);
    }
    markRateLimited(key) {
        const provider = this.getKeyProvider(key.service);
        provider.markRateLimited(key.hash);
    }
    updateRateLimits(key, headers) {
        const provider = this.getKeyProvider(key.service);
        if (provider instanceof provider_2.OpenAIKeyProvider) {
            provider.updateRateLimits(key.hash, headers);
        }
    }
    recheck(service) {
        if (!config_1.config.checkKeys) {
            logger_1.logger.info("Skipping key recheck because key checking is disabled");
            return;
        }
        const provider = this.getKeyProvider(service);
        provider.recheck();
    }
    getServiceForModel(model) {
        if (model.startsWith("gpt") ||
            model.startsWith("text-embedding-ada") ||
            model.startsWith("dall-e")) {
            // https://platform.openai.com/docs/models/model-endpoint-compatibility
            return "openai";
        }
        else if (model.startsWith("claude-")) {
            // https://console.anthropic.com/docs/api/reference#parameters
            if (!model.includes('@')) {
                return "anthropic";
            }
            else {
                return "gcp";
            }
        }
        else if (model.includes("gemini")) {
            // https://developers.generativeai.google.com/models/language
            return "google-ai";
        }
        else if (model.includes("mistral")) {
            // https://docs.mistral.ai/platform/endpoints
            return "mistral-ai";
        }
        else if (model.startsWith("anthropic.claude")) {
            // AWS offers models from a few providers
            // https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids-arns.html
            return "aws";
        }
        else if (model.startsWith("azure")) {
            return "azure";
        }
        throw new Error(`Unknown service for model '${model}'`);
    }
    getKeyProvider(service) {
        return this.keyProviders.find((provider) => provider.service === service);
    }
    /**
     * Schedules a periodic recheck of OpenAI keys, which runs every 8 hours on
     * a schedule offset by the server's hostname.
     */
    scheduleRecheck() {
        const machineHash = crypto_1.default
            .createHash("sha256")
            .update(os_1.default.hostname())
            .digest("hex");
        const offset = parseInt(machineHash, 16) % 7;
        const hour = [0, 8, 16].map((h) => h + offset).join(",");
        const crontab = `0 ${hour} * * *`;
        const job = node_schedule_1.default.scheduleJob(crontab, () => {
            const next = job.nextInvocation();
            logger_1.logger.info({ next }, "Performing periodic recheck of OpenAI keys");
            this.recheck("openai");
        });
        logger_1.logger.info({ rule: crontab, next: job.nextInvocation() }, "Scheduled periodic key recheck job");
        this.recheckJobs.openai = job;
    }
}
exports.KeyPool = KeyPool;
//# sourceMappingURL=key-pool.js.map
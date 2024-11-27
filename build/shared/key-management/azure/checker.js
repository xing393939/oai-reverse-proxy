"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureOpenAIKeyChecker = void 0;
const axios_1 = require("axios");
const models_1 = require("../../models");
const network_1 = require("../../network");
const key_checker_base_1 = require("../key-checker-base");
const axios = (0, network_1.getAxiosInstance)();
const MIN_CHECK_INTERVAL = 3 * 1000; // 3 seconds
const KEY_CHECK_PERIOD = 60 * 60 * 1000; // 1 hour
const AZURE_HOST = process.env.AZURE_HOST || "%RESOURCE_NAME%.openai.azure.com";
const POST_CHAT_COMPLETIONS = (resourceName, deploymentId) => `https://${AZURE_HOST.replace("%RESOURCE_NAME%", resourceName)}/openai/deployments/${deploymentId}/chat/completions?api-version=2023-09-01-preview`;
class AzureOpenAIKeyChecker extends key_checker_base_1.KeyCheckerBase {
    constructor(keys, updateKey) {
        super(keys, {
            service: "azure",
            keyCheckPeriod: KEY_CHECK_PERIOD,
            minCheckInterval: MIN_CHECK_INTERVAL,
            recurringChecksEnabled: true,
            updateKey,
        });
    }
    async testKeyOrFail(key) {
        const model = await this.testModel(key);
        this.log.info({ key: key.hash, deploymentModel: model }, "Checked key.");
        this.updateKey(key.hash, { modelFamilies: [model] });
    }
    handleAxiosError(key, error) {
        if (error.response && AzureOpenAIKeyChecker.errorIsAzureError(error)) {
            const data = error.response.data;
            const errorType = data.error.code || data.error.type;
            switch (errorType) {
                case "DeploymentNotFound":
                    this.log.warn({ key: key.hash, errorType, error: error.response.data }, "Key is revoked or deployment ID is incorrect. Disabling key.");
                    return this.updateKey(key.hash, {
                        isDisabled: true,
                        isRevoked: true,
                    });
                case "401":
                    this.log.warn({ key: key.hash, errorType, error: error.response.data }, "Key is disabled or incorrect. Disabling key.");
                    return this.updateKey(key.hash, {
                        isDisabled: true,
                        isRevoked: true,
                    });
                case "429":
                    const headers = error.response.headers;
                    const retryAfter = Number(headers["retry-after"] || 0);
                    if (retryAfter > 3600) {
                        this.log.warn({ key: key.hash, errorType, error: error.response.data, headers }, "Key has an excessive rate limit and will be disabled.");
                        return this.updateKey(key.hash, { isDisabled: true });
                    }
                    this.log.warn({ key: key.hash, errorType, error: error.response.data, headers }, "Key is rate limited. Rechecking key in 1 minute.");
                    this.updateKey(key.hash, { lastChecked: Date.now() });
                    setTimeout(async () => {
                        this.log.info({ key: key.hash }, "Rechecking Azure key after rate limit.");
                        await this.checkKey(key);
                    }, 1000 * 60);
                    return;
                default:
                    const { data: errorData, status: errorStatus } = error.response;
                    this.log.error({ key: key.hash, errorType, errorData, errorStatus }, "Unknown Azure API error while checking key. Please report this.");
                    return this.updateKey(key.hash, { lastChecked: Date.now() });
            }
        }
        const { response, code } = error;
        if (code === "ENOTFOUND") {
            this.log.warn({ key: key.hash, error: error.message }, "Resource name is probably incorrect. Disabling key.");
            return this.updateKey(key.hash, { isDisabled: true, isRevoked: true });
        }
        const { headers, status, data } = response ?? {};
        this.log.error({ key: key.hash, status, headers, data, error: error.stack }, "Network error while checking key; trying this key again in a minute.");
        const oneMinute = 60 * 1000;
        const next = Date.now() - (KEY_CHECK_PERIOD - oneMinute);
        this.updateKey(key.hash, { lastChecked: next });
    }
    async testModel(key) {
        const { apiKey, deploymentId, resourceName } = AzureOpenAIKeyChecker.getCredentialsFromKey(key);
        const url = POST_CHAT_COMPLETIONS(resourceName, deploymentId);
        const testRequest = {
            max_tokens: 1,
            stream: false,
            messages: [{ role: "user", content: "" }],
        };
        const response = await axios.post(url, testRequest, {
            headers: { "Content-Type": "application/json", "api-key": apiKey },
            validateStatus: (status) => status === 200 || status === 400,
        });
        const { data } = response;
        // We allow one 400 condition, OperationNotSupported, which is returned when
        // we try to invoke /chat/completions on dall-e-3. This is expected and
        // indicates a DALL-E deployment.
        if (response.status === 400) {
            if (data.error.code === "OperationNotSupported")
                return "azure-dall-e";
            throw new axios_1.AxiosError(`Unexpected error when testing deployment ${deploymentId}`, "AZURE_TEST_ERROR", response.config, response.request, response);
        }
        const family = (0, models_1.getAzureOpenAIModelFamily)(data.model);
        this.updateKey(key.hash, { modelIds: [data.model] });
        // Azure returns "gpt-4" even for GPT-4 Turbo, so we need further checks.
        // Otherwise we can use the model family Azure returned.
        if (family !== "azure-gpt4") {
            return family;
        }
        // Try to send an oversized prompt. GPT-4 Turbo can handle this but regular
        // GPT-4 will return a Bad Request error.
        const contextText = {
            max_tokens: 9000,
            stream: false,
            temperature: 0,
            seed: 0,
            messages: [{ role: "user", content: "" }],
        };
        const { data: contextTest, status } = await axios.post(url, contextText, {
            headers: { "Content-Type": "application/json", "api-key": apiKey },
            validateStatus: (status) => status === 400 || status === 200,
        });
        const code = contextTest.error?.code;
        this.log.debug({ code, status }, "Performed Azure GPT4 context size test.");
        if (code === "context_length_exceeded")
            return "azure-gpt4";
        return "azure-gpt4-turbo";
    }
    static errorIsAzureError(error) {
        const data = error.response?.data;
        return data?.error?.code || data?.error?.type;
    }
    static getCredentialsFromKey(key) {
        const [resourceName, deploymentId, apiKey] = key.key.split(":");
        if (!resourceName || !deploymentId || !apiKey) {
            throw new Error("Invalid Azure credential format. Refer to .env.example and ensure your credentials are in the format RESOURCE_NAME:DEPLOYMENT_ID:API_KEY with commas between each credential set.");
        }
        return { resourceName, deploymentId, apiKey };
    }
}
exports.AzureOpenAIKeyChecker = AzureOpenAIKeyChecker;
//# sourceMappingURL=checker.js.map
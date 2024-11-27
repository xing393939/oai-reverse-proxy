"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GcpKeyChecker = void 0;
const network_1 = require("../../network");
const key_checker_base_1 = require("../key-checker-base");
const oauth_1 = require("./oauth");
const axios = (0, network_1.getAxiosInstance)();
const MIN_CHECK_INTERVAL = 3 * 1000; // 3 seconds
const KEY_CHECK_PERIOD = 90 * 60 * 1000; // 90 minutes
const GCP_HOST = process.env.GCP_HOST || "%REGION%-aiplatform.googleapis.com";
const POST_STREAM_RAW_URL = (project, region, model) => `https://${GCP_HOST.replace("%REGION%", region)}/v1/projects/${project}/locations/${region}/publishers/anthropic/models/${model}:streamRawPredict`;
const TEST_MESSAGES = [
    { role: "user", content: "Hi!" },
    { role: "assistant", content: "Hello!" },
];
class GcpKeyChecker extends key_checker_base_1.KeyCheckerBase {
    constructor(keys, updateKey) {
        super(keys, {
            service: "gcp",
            keyCheckPeriod: KEY_CHECK_PERIOD,
            minCheckInterval: MIN_CHECK_INTERVAL,
            recurringChecksEnabled: false,
            updateKey,
        });
    }
    async testKeyOrFail(key) {
        let checks = [];
        const isInitialCheck = !key.lastChecked;
        if (isInitialCheck) {
            await this.maybeRefreshAccessToken(key);
            checks = [
                this.invokeModel("claude-3-haiku@20240307", key, true),
                this.invokeModel("claude-3-sonnet@20240229", key, true),
                this.invokeModel("claude-3-opus@20240229", key, true),
                this.invokeModel("claude-3-5-sonnet@20240620", key, true),
            ];
            const [sonnet, haiku, opus, sonnet35] = await Promise.all(checks);
            this.log.debug({ key: key.hash, sonnet, haiku, opus, sonnet35 }, "GCP model initial tests complete.");
            const families = [];
            if (sonnet || sonnet35 || haiku)
                families.push("gcp-claude");
            if (opus)
                families.push("gcp-claude-opus");
            if (families.length === 0) {
                this.log.warn({ key: key.hash }, "Key does not have access to any models; disabling.");
                return this.updateKey(key.hash, { isDisabled: true });
            }
            this.updateKey(key.hash, {
                sonnetEnabled: sonnet,
                haikuEnabled: haiku,
                sonnet35Enabled: sonnet35,
                modelFamilies: families,
            });
        }
        else {
            await this.maybeRefreshAccessToken(key);
            if (key.haikuEnabled) {
                await this.invokeModel("claude-3-haiku@20240307", key, false);
            }
            else if (key.sonnetEnabled) {
                await this.invokeModel("claude-3-sonnet@20240229", key, false);
            }
            else if (key.sonnet35Enabled) {
                await this.invokeModel("claude-3-5-sonnet@20240620", key, false);
            }
            else {
                await this.invokeModel("claude-3-opus@20240229", key, false);
            }
            this.updateKey(key.hash, { lastChecked: Date.now() });
            this.log.debug({ key: key.hash }, "GCP key check complete.");
        }
        this.log.info({ key: key.hash, families: key.modelFamilies }, "Checked key.");
    }
    handleAxiosError(key, error) {
        if (error.response && GcpKeyChecker.errorIsGcpError(error)) {
            const { status, data } = error.response;
            if (status === 400 || status === 401 || status === 403) {
                this.log.warn({ key: key.hash, error: data }, "Key is invalid or revoked. Disabling key.");
                this.updateKey(key.hash, { isDisabled: true, isRevoked: true });
            }
            else if (status === 429) {
                this.log.warn({ key: key.hash, error: data }, "Key is rate limited. Rechecking in a minute.");
                const next = Date.now() - (KEY_CHECK_PERIOD - 60 * 1000);
                this.updateKey(key.hash, { lastChecked: next });
            }
            else {
                this.log.error({ key: key.hash, status, error: data }, "Encountered unexpected error status while checking key. This may indicate a change in the API; please report this.");
                this.updateKey(key.hash, { lastChecked: Date.now() });
            }
            return;
        }
        const { response, cause } = error;
        const { headers, status, data } = response ?? {};
        this.log.error({ key: key.hash, status, headers, data, cause, error: error.message }, "Network error while checking key; trying this key again in a minute.");
        const oneMinute = 60 * 1000;
        const next = Date.now() - (KEY_CHECK_PERIOD - oneMinute);
        this.updateKey(key.hash, { lastChecked: next });
    }
    async maybeRefreshAccessToken(key) {
        if (key.accessToken && key.accessTokenExpiresAt >= Date.now()) {
            return;
        }
        this.log.info({ key: key.hash }, "Refreshing GCP access token...");
        const [token, durationSec] = await (0, oauth_1.refreshGcpAccessToken)(key);
        this.updateKey(key.hash, {
            accessToken: token,
            accessTokenExpiresAt: Date.now() + durationSec * 1000 * 0.95,
        });
    }
    /**
     * Attempt to invoke the given model with the given key.  Returns true if the
     * key has access to the model, false if it does not. Throws an error if the
     * key is disabled.
     */
    async invokeModel(model, key, initial) {
        const creds = await (0, oauth_1.getCredentialsFromGcpKey)(key);
        try {
            await this.maybeRefreshAccessToken(key);
        }
        catch (e) {
            this.log.error({ key: key.hash, error: e.message }, "Could not test key due to error while getting access token.");
            return false;
        }
        const payload = {
            max_tokens: 1,
            messages: TEST_MESSAGES,
            anthropic_version: "vertex-2023-10-16",
        };
        const { data, status } = await axios.post(POST_STREAM_RAW_URL(creds.projectId, creds.region, model), payload, {
            headers: GcpKeyChecker.getRequestHeaders(key.accessToken),
            validateStatus: initial
                ? () => true
                : (status) => status >= 200 && status < 300,
        });
        this.log.debug({ key: key.hash, data }, "Response from GCP");
        if (initial) {
            return ((status >= 200 && status < 300) || status === 429 || status === 529);
        }
        return true;
    }
    static errorIsGcpError(error) {
        const data = error.response?.data;
        if (Array.isArray(data)) {
            return data.length > 0 && data[0]?.error?.message;
        }
        else {
            return data?.error?.message;
        }
    }
    static getRequestHeaders(accessToken) {
        return {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        };
    }
}
exports.GcpKeyChecker = GcpKeyChecker;
//# sourceMappingURL=checker.js.map
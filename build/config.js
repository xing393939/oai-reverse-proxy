"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listConfig = exports.OMITTED_KEYS = exports.SENSITIVE_KEYS = exports.assertConfigIsValid = exports.SECRET_SIGNING_KEY = exports.config = exports.USER_ASSETS_DIR = exports.DATA_DIR = void 0;
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const pino_1 = __importDefault(require("pino"));
const models_1 = require("./shared/models");
dotenv_1.default.config();
const startupLogger = (0, pino_1.default)({ level: "debug" }).child({ module: "startup" });
const isDev = process.env.NODE_ENV !== "production";
exports.DATA_DIR = path_1.default.join(__dirname, "..", "data");
exports.USER_ASSETS_DIR = path_1.default.join(exports.DATA_DIR, "user-files");
// To change configs, create a file called .env in the root directory.
// See .env.example for an example.
exports.config = {
    port: getEnvWithDefault("PORT", 7860),
    bindAddress: getEnvWithDefault("BIND_ADDRESS", "0.0.0.0"),
    openaiKey: getEnvWithDefault("OPENAI_KEY", ""),
    anthropicKey: getEnvWithDefault("ANTHROPIC_KEY", ""),
    googleAIKey: getEnvWithDefault("GOOGLE_AI_KEY", ""),
    mistralAIKey: getEnvWithDefault("MISTRAL_AI_KEY", ""),
    awsCredentials: getEnvWithDefault("AWS_CREDENTIALS", ""),
    gcpCredentials: getEnvWithDefault("GCP_CREDENTIALS", ""),
    azureCredentials: getEnvWithDefault("AZURE_CREDENTIALS", ""),
    proxyKey: getEnvWithDefault("PROXY_KEY", ""),
    adminKey: getEnvWithDefault("ADMIN_KEY", ""),
    serviceInfoPassword: getEnvWithDefault("SERVICE_INFO_PASSWORD", ""),
    sqliteDataPath: getEnvWithDefault("SQLITE_DATA_PATH", path_1.default.join(exports.DATA_DIR, "database.sqlite")),
    eventLogging: getEnvWithDefault("EVENT_LOGGING", false),
    eventLoggingTrim: getEnvWithDefault("EVENT_LOGGING_TRIM", 5),
    gatekeeper: getEnvWithDefault("GATEKEEPER", "none"),
    gatekeeperStore: getEnvWithDefault("GATEKEEPER_STORE", "memory"),
    maxIpsPerUser: getEnvWithDefault("MAX_IPS_PER_USER", 0),
    maxIpsAutoBan: getEnvWithDefault("MAX_IPS_AUTO_BAN", false),
    captchaMode: getEnvWithDefault("CAPTCHA_MODE", "none"),
    powTokenHours: getEnvWithDefault("POW_TOKEN_HOURS", 24),
    powTokenMaxIps: getEnvWithDefault("POW_TOKEN_MAX_IPS", 2),
    powDifficultyLevel: getEnvWithDefault("POW_DIFFICULTY_LEVEL", "low"),
    powChallengeTimeout: getEnvWithDefault("POW_CHALLENGE_TIMEOUT", 30),
    powTokenPurgeHours: getEnvWithDefault("POW_TOKEN_PURGE_HOURS", 48),
    firebaseRtdbUrl: getEnvWithDefault("FIREBASE_RTDB_URL", undefined),
    firebaseKey: getEnvWithDefault("FIREBASE_KEY", undefined),
    textModelRateLimit: getEnvWithDefault("TEXT_MODEL_RATE_LIMIT", 4),
    imageModelRateLimit: getEnvWithDefault("IMAGE_MODEL_RATE_LIMIT", 4),
    maxContextTokensOpenAI: getEnvWithDefault("MAX_CONTEXT_TOKENS_OPENAI", 32768),
    maxContextTokensAnthropic: getEnvWithDefault("MAX_CONTEXT_TOKENS_ANTHROPIC", 32768),
    maxOutputTokensOpenAI: getEnvWithDefault(["MAX_OUTPUT_TOKENS_OPENAI", "MAX_OUTPUT_TOKENS"], 1024),
    maxOutputTokensAnthropic: getEnvWithDefault(["MAX_OUTPUT_TOKENS_ANTHROPIC", "MAX_OUTPUT_TOKENS"], 1024),
    allowedModelFamilies: getEnvWithDefault("ALLOWED_MODEL_FAMILIES", getDefaultModelFamilies()),
    rejectPhrases: parseCsv(getEnvWithDefault("REJECT_PHRASES", "")),
    rejectMessage: getEnvWithDefault("REJECT_MESSAGE", "This content violates /aicg/'s acceptable use policy."),
    logLevel: getEnvWithDefault("LOG_LEVEL", "info"),
    checkKeys: getEnvWithDefault("CHECK_KEYS", !isDev),
    showTokenCosts: getEnvWithDefault("SHOW_TOKEN_COSTS", false),
    allowAwsLogging: getEnvWithDefault("ALLOW_AWS_LOGGING", false),
    promptLogging: getEnvWithDefault("PROMPT_LOGGING", false),
    promptLoggingBackend: getEnvWithDefault("PROMPT_LOGGING_BACKEND", undefined),
    promptLoggingFilePrefix: getEnvWithDefault("PROMPT_LOGGING_FILE_PREFIX", "prompt-logs"),
    googleSheetsKey: getEnvWithDefault("GOOGLE_SHEETS_KEY", undefined),
    googleSheetsSpreadsheetId: getEnvWithDefault("GOOGLE_SHEETS_SPREADSHEET_ID", undefined),
    blockedOrigins: getEnvWithDefault("BLOCKED_ORIGINS", undefined),
    blockMessage: getEnvWithDefault("BLOCK_MESSAGE", "You must be over the age of majority in your country to use this service."),
    blockRedirect: getEnvWithDefault("BLOCK_REDIRECT", "https://www.9gag.com"),
    tokenQuota: models_1.MODEL_FAMILIES.reduce((acc, family) => {
        acc[family] = getEnvWithDefault(`TOKEN_QUOTA_${family.toUpperCase().replace(/-/g, "_")}`, 0);
        return acc;
    }, {}),
    quotaRefreshPeriod: getEnvWithDefault("QUOTA_REFRESH_PERIOD", undefined),
    allowNicknameChanges: getEnvWithDefault("ALLOW_NICKNAME_CHANGES", true),
    showRecentImages: getEnvWithDefault("SHOW_RECENT_IMAGES", true),
    useInsecureCookies: getEnvWithDefault("USE_INSECURE_COOKIES", isDev),
    staticServiceInfo: getEnvWithDefault("STATIC_SERVICE_INFO", false),
    trustedProxies: getEnvWithDefault("TRUSTED_PROXIES", 1),
    allowOpenAIToolUsage: getEnvWithDefault("ALLOW_OPENAI_TOOL_USAGE", false),
    allowedVisionServices: parseCsv(getEnvWithDefault("ALLOWED_VISION_SERVICES", "")),
    proxyEndpointRoute: getEnvWithDefault("PROXY_ENDPOINT_ROUTE", "/proxy"),
    adminWhitelist: parseCsv(getEnvWithDefault("ADMIN_WHITELIST", "0.0.0.0/0,::/0")),
    ipBlacklist: parseCsv(getEnvWithDefault("IP_BLACKLIST", "")),
    tokensPunishmentFactor: getEnvWithDefault("TOKENS_PUNISHMENT_FACTOR", 0.0),
    httpAgent: {
        interface: getEnvWithDefault("HTTP_AGENT_INTERFACE", undefined),
        proxyUrl: getEnvWithDefault("HTTP_AGENT_PROXY_URL", undefined),
    },
};
function generateSigningKey() {
    if (process.env.COOKIE_SECRET !== undefined) {
        // legacy, replaced by SIGNING_KEY
        return process.env.COOKIE_SECRET;
    }
    else if (process.env.SIGNING_KEY !== undefined) {
        return process.env.SIGNING_KEY;
    }
    const secrets = [
        exports.config.adminKey,
        exports.config.openaiKey,
        exports.config.anthropicKey,
        exports.config.googleAIKey,
        exports.config.mistralAIKey,
        exports.config.awsCredentials,
        exports.config.gcpCredentials,
        exports.config.azureCredentials,
    ];
    if (secrets.filter((s) => s).length === 0) {
        startupLogger.warn("No SIGNING_KEY or secrets are set. All sessions, cookies, and proofs of work will be invalidated on restart.");
        return crypto_1.default.randomBytes(32).toString("hex");
    }
    startupLogger.info("No SIGNING_KEY set; one will be generated from secrets.");
    startupLogger.info("It's recommended to set SIGNING_KEY explicitly to ensure users' sessions and cookies always persist across restarts.");
    const seed = secrets.map((s) => s || "n/a").join("");
    return crypto_1.default.createHash("sha256").update(seed).digest("hex");
}
const signingKey = generateSigningKey();
exports.SECRET_SIGNING_KEY = signingKey;
async function assertConfigIsValid() {
    if (process.env.MODEL_RATE_LIMIT !== undefined) {
        const limit = parseInt(process.env.MODEL_RATE_LIMIT, 10) || exports.config.textModelRateLimit;
        exports.config.textModelRateLimit = limit;
        exports.config.imageModelRateLimit = Math.max(Math.floor(limit / 2), 1);
        startupLogger.warn({ textLimit: limit, imageLimit: exports.config.imageModelRateLimit }, "MODEL_RATE_LIMIT is deprecated. Use TEXT_MODEL_RATE_LIMIT and IMAGE_MODEL_RATE_LIMIT instead.");
    }
    if (process.env.ALLOW_IMAGE_PROMPTS === "true") {
        const hasAllowedServices = exports.config.allowedVisionServices.length > 0;
        if (!hasAllowedServices) {
            exports.config.allowedVisionServices = ["openai", "anthropic"];
            startupLogger.warn({ allowedVisionServices: exports.config.allowedVisionServices }, "ALLOW_IMAGE_PROMPTS is deprecated. Use ALLOWED_VISION_SERVICES instead.");
        }
    }
    if (exports.config.promptLogging && !exports.config.promptLoggingBackend) {
        throw new Error("Prompt logging is enabled but no backend is configured. Set PROMPT_LOGGING_BACKEND to 'google_sheets' or 'file'.");
    }
    if (!["none", "proxy_key", "user_token"].includes(exports.config.gatekeeper)) {
        throw new Error(`Invalid gatekeeper mode: ${exports.config.gatekeeper}. Must be one of: none, proxy_key, user_token.`);
    }
    if (exports.config.gatekeeper === "user_token" && !exports.config.adminKey) {
        throw new Error("`user_token` gatekeeper mode requires an `ADMIN_KEY` to be set.");
    }
    if (exports.config.captchaMode === "proof_of_work" &&
        exports.config.gatekeeper !== "user_token") {
        throw new Error("Captcha mode 'proof_of_work' requires gatekeeper mode 'user_token'.");
    }
    if (exports.config.captchaMode === "proof_of_work") {
        const val = exports.config.powDifficultyLevel;
        const isDifficulty = typeof val === "string" &&
            ["low", "medium", "high", "extreme"].includes(val);
        const isIterations = typeof val === "number" && Number.isInteger(val) && val > 0;
        if (!isDifficulty && !isIterations) {
            throw new Error("Invalid POW_DIFFICULTY_LEVEL. Must be one of: low, medium, high, extreme, or a positive integer.");
        }
    }
    if (exports.config.gatekeeper === "proxy_key" && !exports.config.proxyKey) {
        throw new Error("`proxy_key` gatekeeper mode requires a `PROXY_KEY` to be set.");
    }
    if (exports.config.gatekeeperStore === "firebase_rtdb" &&
        (!exports.config.firebaseKey || !exports.config.firebaseRtdbUrl)) {
        throw new Error("Firebase RTDB store requires `FIREBASE_KEY` and `FIREBASE_RTDB_URL` to be set.");
    }
    if (Object.values(exports.config.httpAgent || {}).filter(Boolean).length === 0) {
        delete exports.config.httpAgent;
    }
    else if (exports.config.httpAgent) {
        if (exports.config.httpAgent.interface && exports.config.httpAgent.proxyUrl) {
            throw new Error("Cannot set both `HTTP_AGENT_INTERFACE` and `HTTP_AGENT_PROXY_URL`.");
        }
    }
    // Ensure forks which add new secret-like config keys don't unwittingly expose
    // them to users.
    for (const key of getKeys(exports.config)) {
        const maybeSensitive = ["key", "credentials", "secret", "password"].some((sensitive) => key.toLowerCase().includes(sensitive) && !["checkKeys"].includes(key));
        const secured = new Set([...exports.SENSITIVE_KEYS, ...exports.OMITTED_KEYS]);
        if (maybeSensitive && !secured.has(key))
            throw new Error(`Config key "${key}" may be sensitive but is exposed. Add it to SENSITIVE_KEYS or OMITTED_KEYS.`);
    }
}
exports.assertConfigIsValid = assertConfigIsValid;
/**
 * Config keys that are masked on the info page, but not hidden as their
 * presence may be relevant to the user due to privacy implications.
 */
exports.SENSITIVE_KEYS = [
    "googleSheetsSpreadsheetId",
    "httpAgent",
];
/**
 * Config keys that are not displayed on the info page at all, generally because
 * they are not relevant to the user or can be inferred from other config.
 */
exports.OMITTED_KEYS = [
    "port",
    "bindAddress",
    "logLevel",
    "openaiKey",
    "anthropicKey",
    "googleAIKey",
    "mistralAIKey",
    "awsCredentials",
    "gcpCredentials",
    "azureCredentials",
    "proxyKey",
    "adminKey",
    "serviceInfoPassword",
    "rejectPhrases",
    "rejectMessage",
    "showTokenCosts",
    "promptLoggingFilePrefix",
    "googleSheetsKey",
    "firebaseKey",
    "firebaseRtdbUrl",
    "sqliteDataPath",
    "eventLogging",
    "eventLoggingTrim",
    "gatekeeperStore",
    "maxIpsPerUser",
    "blockedOrigins",
    "blockMessage",
    "blockRedirect",
    "allowNicknameChanges",
    "showRecentImages",
    "useInsecureCookies",
    "staticServiceInfo",
    "checkKeys",
    "allowedModelFamilies",
    "trustedProxies",
    "proxyEndpointRoute",
    "adminWhitelist",
    "ipBlacklist",
    "powTokenPurgeHours",
];
const getKeys = Object.keys;
function listConfig(obj = exports.config) {
    const result = {};
    for (const key of getKeys(obj)) {
        const value = obj[key]?.toString() || "";
        const shouldMask = exports.SENSITIVE_KEYS.includes(key);
        const shouldOmit = exports.OMITTED_KEYS.includes(key) ||
            value === "" ||
            value === "undefined";
        if (shouldOmit) {
            continue;
        }
        const validKey = key;
        if (value && shouldMask) {
            result[validKey] = "********";
        }
        else {
            result[validKey] = value;
        }
        if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            result[key] = listConfig(obj[key]);
        }
    }
    return result;
}
exports.listConfig = listConfig;
/**
 * Tries to get a config value from one or more environment variables (in
 * order), falling back to a default value if none are set.
 */
function getEnvWithDefault(env, defaultValue) {
    const value = Array.isArray(env)
        ? env.map((e) => process.env[e]).find((v) => v !== undefined)
        : process.env[env];
    if (value === undefined) {
        return defaultValue;
    }
    try {
        if ([
            "OPENAI_KEY",
            "ANTHROPIC_KEY",
            "GOOGLE_AI_KEY",
            "AWS_CREDENTIALS",
            "GCP_CREDENTIALS",
            "AZURE_CREDENTIALS",
        ].includes(String(env))) {
            return value;
        }
        // Intended to be used for comma-delimited lists
        if (Array.isArray(defaultValue)) {
            return value.split(",").map((v) => v.trim());
        }
        return JSON.parse(value);
    }
    catch (err) {
        return value;
    }
}
function parseCsv(val) {
    if (!val)
        return [];
    const regex = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
    const matches = val.match(regex) || [];
    return matches.map((item) => item.replace(/^"|"$/g, "").trim());
}
function getDefaultModelFamilies() {
    return models_1.MODEL_FAMILIES.filter((f) => !f.includes("dall-e") && !f.includes("o1"));
}
//# sourceMappingURL=config.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInfo = void 0;
const config_1 = require("./config");
const key_management_1 = require("./shared/key-management");
const models_1 = require("./shared/models");
const stats_1 = require("./shared/stats");
const rate_limit_1 = require("./proxy/rate-limit");
const utils_1 = require("./shared/utils");
const queue_1 = require("./proxy/queue");
const CACHE_TTL = 2000;
const keyIsOpenAIKey = (k) => k.service === "openai";
const keyIsAnthropicKey = (k) => k.service === "anthropic";
const keyIsAwsKey = (k) => k.service === "aws";
const keyIsGcpKey = (k) => k.service === "gcp";
// https://stackoverflow.com/a/66661477
// type DeepKeyOf<T> = (
//   [T] extends [never]
//     ? ""
//     : T extends object
//     ? {
//         [K in Exclude<keyof T, symbol>]: `${K}${DotPrefix<DeepKeyOf<T[K]>>}`;
//       }[Exclude<keyof T, symbol>]
//     : ""
// ) extends infer D
//   ? Extract<D, string>
//   : never;
// type DotPrefix<T extends string> = T extends "" ? "" : `.${T}`;
// type ServiceInfoPath = `{${DeepKeyOf<ServiceInfo>}}`;
const SERVICE_ENDPOINTS = {
    openai: {
        openai: `%BASE%/openai`,
        "openai-image": `%BASE%/openai-image`,
    },
    anthropic: {
        anthropic: `%BASE%/anthropic`,
    },
    "google-ai": {
        "google-ai": `%BASE%/google-ai`,
    },
    "mistral-ai": {
        "mistral-ai": `%BASE%/mistral-ai`,
    },
    aws: {
        "aws-claude": `%BASE%/aws/claude`,
        "aws-mistral": `%BASE%/aws/mistral`,
    },
    gcp: {
        gcp: `%BASE%/gcp/claude`,
    },
    azure: {
        azure: `%BASE%/azure/openai`,
        "azure-image": `%BASE%/azure/openai`,
    },
};
const familyStats = new Map();
const serviceStats = new Map();
let cachedInfo;
let cacheTime = 0;
function buildInfo(baseUrl, forAdmin = false) {
    if (cacheTime + CACHE_TTL > Date.now())
        return cachedInfo;
    const keys = key_management_1.keyPool.list();
    const accessibleFamilies = new Set(keys
        .flatMap((k) => k.modelFamilies)
        .filter((f) => config_1.config.allowedModelFamilies.includes(f))
        .concat("turbo"));
    familyStats.clear();
    serviceStats.clear();
    keys.forEach(addKeyToAggregates);
    const endpoints = getEndpoints(baseUrl, accessibleFamilies);
    const trafficStats = getTrafficStats();
    const { serviceInfo, modelFamilyInfo } = getServiceModelStats(accessibleFamilies);
    const status = getStatus();
    if (config_1.config.staticServiceInfo && !forAdmin) {
        delete trafficStats.proompts;
        delete trafficStats.tookens;
        delete trafficStats.proomptersNow;
        for (const family of Object.keys(modelFamilyInfo)) {
            (0, models_1.assertIsKnownModelFamily)(family);
            delete modelFamilyInfo[family]?.proomptersInQueue;
            delete modelFamilyInfo[family]?.estimatedQueueTime;
            delete modelFamilyInfo[family]?.usage;
        }
    }
    return (cachedInfo = {
        uptime: Math.floor(process.uptime()),
        endpoints,
        ...trafficStats,
        ...serviceInfo,
        status,
        ...modelFamilyInfo,
        config: (0, config_1.listConfig)(),
        build: process.env.BUILD_INFO || "dev",
    });
}
exports.buildInfo = buildInfo;
function getStatus() {
    if (!config_1.config.checkKeys)
        return "Key checking is disabled. The data displayed are not reliable.";
    let unchecked = 0;
    for (const service of models_1.LLM_SERVICES) {
        unchecked += serviceStats.get(`${service}__uncheckedKeys`) || 0;
    }
    return unchecked ? `Checking ${unchecked} keys...` : undefined;
}
function getEndpoints(baseUrl, accessibleFamilies) {
    const endpoints = {};
    const keys = key_management_1.keyPool.list();
    for (const service of models_1.LLM_SERVICES) {
        if (!keys.some((k) => k.service === service)) {
            continue;
        }
        for (const [name, url] of Object.entries(SERVICE_ENDPOINTS[service])) {
            endpoints[name] = url.replace("%BASE%", baseUrl);
        }
        if (service === "openai" && !accessibleFamilies.has("dall-e")) {
            delete endpoints["openai-image"];
        }
        if (service === "azure" && !accessibleFamilies.has("azure-dall-e")) {
            delete endpoints["azure-image"];
        }
    }
    return endpoints;
}
function getTrafficStats() {
    const tokens = serviceStats.get("tokens") || 0;
    const tokenCost = serviceStats.get("tokenCost") || 0;
    return {
        proompts: serviceStats.get("proompts") || 0,
        tookens: `${(0, stats_1.prettyTokens)(tokens)}${(0, stats_1.getCostSuffix)(tokenCost)}`,
        ...(config_1.config.textModelRateLimit ? { proomptersNow: (0, rate_limit_1.getUniqueIps)() } : {}),
    };
}
function getServiceModelStats(accessibleFamilies) {
    const serviceInfo = {};
    const modelFamilyInfo = {};
    for (const service of models_1.LLM_SERVICES) {
        const hasKeys = serviceStats.get(`${service}__keys`) || 0;
        if (!hasKeys)
            continue;
        serviceInfo[`${service}Keys`] = hasKeys;
        accessibleFamilies.forEach((f) => {
            if (models_1.MODEL_FAMILY_SERVICE[f] === service) {
                modelFamilyInfo[f] = getInfoForFamily(f);
            }
        });
        if (service === "openai" && config_1.config.checkKeys) {
            serviceInfo.openaiOrgs = getUniqueOpenAIOrgs(key_management_1.keyPool.list());
        }
    }
    return { serviceInfo, modelFamilyInfo };
}
function getUniqueOpenAIOrgs(keys) {
    const orgIds = new Set(keys.filter((k) => k.service === "openai").map((k) => k.organizationId));
    return orgIds.size;
}
function increment(map, key, delta = 1) {
    map.set(key, (map.get(key) || 0) + delta);
}
const addToService = increment.bind(null, serviceStats);
const addToFamily = increment.bind(null, familyStats);
function addKeyToAggregates(k) {
    addToService("proompts", k.promptCount);
    addToService("openai__keys", k.service === "openai" ? 1 : 0);
    addToService("anthropic__keys", k.service === "anthropic" ? 1 : 0);
    addToService("google-ai__keys", k.service === "google-ai" ? 1 : 0);
    addToService("mistral-ai__keys", k.service === "mistral-ai" ? 1 : 0);
    addToService("aws__keys", k.service === "aws" ? 1 : 0);
    addToService("gcp__keys", k.service === "gcp" ? 1 : 0);
    addToService("azure__keys", k.service === "azure" ? 1 : 0);
    let sumTokens = 0;
    let sumCost = 0;
    const incrementGenericFamilyStats = (f) => {
        const tokens = k[`${f}Tokens`];
        sumTokens += tokens;
        sumCost += (0, stats_1.getTokenCostUsd)(f, tokens);
        addToFamily(`${f}__tokens`, tokens);
        addToFamily(`${f}__revoked`, k.isRevoked ? 1 : 0);
        addToFamily(`${f}__active`, k.isDisabled ? 0 : 1);
    };
    switch (k.service) {
        case "openai":
            if (!keyIsOpenAIKey(k))
                throw new Error("Invalid key type");
            addToService("openai__uncheckedKeys", Boolean(k.lastChecked) ? 0 : 1);
            k.modelFamilies.forEach((f) => {
                incrementGenericFamilyStats(f);
                addToFamily(`${f}__trial`, k.isTrial ? 1 : 0);
                addToFamily(`${f}__overQuota`, k.isOverQuota ? 1 : 0);
            });
            break;
        case "anthropic":
            if (!keyIsAnthropicKey(k))
                throw new Error("Invalid key type");
            addToService("anthropic__uncheckedKeys", Boolean(k.lastChecked) ? 0 : 1);
            k.modelFamilies.forEach((f) => {
                incrementGenericFamilyStats(f);
                addToFamily(`${f}__trial`, k.tier === "free" ? 1 : 0);
                addToFamily(`${f}__overQuota`, k.isOverQuota ? 1 : 0);
                addToFamily(`${f}__pozzed`, k.isPozzed ? 1 : 0);
            });
            break;
        case "aws": {
            if (!keyIsAwsKey(k))
                throw new Error("Invalid key type");
            k.modelFamilies.forEach(incrementGenericFamilyStats);
            if (!k.isDisabled) {
                // Don't add revoked keys to available AWS variants
                k.modelIds.forEach((id) => {
                    if (id.includes("claude-3-sonnet")) {
                        addToFamily(`aws-claude__awsSonnet3`, 1);
                    }
                    else if (id.includes("claude-3-5-sonnet")) {
                        addToFamily(`aws-claude__awsSonnet3_5`, 1);
                    }
                    else if (id.includes("claude-3-haiku")) {
                        addToFamily(`aws-claude__awsHaiku`, 1);
                    }
                    else if (id.includes("claude-v2")) {
                        addToFamily(`aws-claude__awsClaude2`, 1);
                    }
                });
            }
            // Ignore revoked keys for aws logging stats, but include keys where the
            // logging status is unknown.
            const countAsLogged = k.lastChecked && !k.isDisabled && k.awsLoggingStatus === "enabled";
            addToFamily(`aws-claude__awsLogged`, countAsLogged ? 1 : 0);
            break;
        }
        case "gcp":
            if (!keyIsGcpKey(k))
                throw new Error("Invalid key type");
            k.modelFamilies.forEach(incrementGenericFamilyStats);
            // TODO: add modelIds to GcpKey
            break;
        // These services don't have any additional stats to track.
        case "azure":
        case "google-ai":
        case "mistral-ai":
            k.modelFamilies.forEach(incrementGenericFamilyStats);
            break;
        default:
            (0, utils_1.assertNever)(k.service);
    }
    addToService("tokens", sumTokens);
    addToService("tokenCost", sumCost);
}
function getInfoForFamily(family) {
    const tokens = familyStats.get(`${family}__tokens`) || 0;
    const cost = (0, stats_1.getTokenCostUsd)(family, tokens);
    let info = {
        usage: `${(0, stats_1.prettyTokens)(tokens)} tokens${(0, stats_1.getCostSuffix)(cost)}`,
        activeKeys: familyStats.get(`${family}__active`) || 0,
        revokedKeys: familyStats.get(`${family}__revoked`) || 0,
    };
    // Add service-specific stats to the info object.
    if (config_1.config.checkKeys) {
        const service = models_1.MODEL_FAMILY_SERVICE[family];
        switch (service) {
            case "openai":
                info.overQuotaKeys = familyStats.get(`${family}__overQuota`) || 0;
                info.trialKeys = familyStats.get(`${family}__trial`) || 0;
                // Delete trial/revoked keys for non-turbo families.
                // Trials are turbo 99% of the time, and if a key is invalid we don't
                // know what models it might have had assigned to it.
                if (family !== "turbo") {
                    delete info.trialKeys;
                    delete info.revokedKeys;
                }
                break;
            case "anthropic":
                info.overQuotaKeys = familyStats.get(`${family}__overQuota`) || 0;
                info.trialKeys = familyStats.get(`${family}__trial`) || 0;
                info.prefilledKeys = familyStats.get(`${family}__pozzed`) || 0;
                break;
            case "aws":
                if (family === "aws-claude") {
                    const logged = familyStats.get(`${family}__awsLogged`) || 0;
                    const variants = new Set();
                    if (familyStats.get(`${family}__awsClaude2`) || 0)
                        variants.add("claude2");
                    if (familyStats.get(`${family}__awsSonnet3`) || 0)
                        variants.add("sonnet3");
                    if (familyStats.get(`${family}__awsSonnet3_5`) || 0)
                        variants.add("sonnet3.5");
                    if (familyStats.get(`${family}__awsHaiku`) || 0)
                        variants.add("haiku");
                    info.enabledVariants = variants.size
                        ? `${Array.from(variants).join(",")}`
                        : undefined;
                    if (logged > 0) {
                        info.privacy = config_1.config.allowAwsLogging
                            ? `AWS logging verification inactive. Prompts could be logged.`
                            : `${logged} active keys are potentially logged and can't be used. Set ALLOW_AWS_LOGGING=true to override.`;
                    }
                }
                break;
            case "gcp":
                if (family === "gcp-claude") {
                    // TODO: implement
                    info.enabledVariants = "not implemented";
                }
                break;
        }
    }
    // Add queue stats to the info object.
    const queue = getQueueInformation(family);
    info.proomptersInQueue = queue.proomptersInQueue;
    info.estimatedQueueTime = queue.estimatedQueueTime;
    return info;
}
/** Returns queue time in seconds, or minutes + seconds if over 60 seconds. */
function getQueueInformation(partition) {
    const waitMs = (0, queue_1.getEstimatedWaitTime)(partition);
    const waitTime = waitMs < 60000
        ? `${Math.round(waitMs / 1000)}sec`
        : `${Math.round(waitMs / 60000)}min, ${Math.round((waitMs % 60000) / 1000)}sec`;
    return {
        proomptersInQueue: (0, queue_1.getQueueLength)(partition),
        estimatedQueueTime: waitMs > 2000 ? waitTime : "no wait",
    };
}
//# sourceMappingURL=service-info.js.map
"use strict";
/**
 * Basic user management. Handles creation and tracking of proxy users, personal
 * access tokens, and quota management. Supports in-memory and Firebase Realtime
 * Database persistence stores.
 *
 * Users are identified solely by their personal access token. The token is
 * used to authenticate the user for all proxied requests.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextQuotaRefresh = exports.disableUser = exports.resetUsage = exports.refreshQuota = exports.hasAvailableQuota = exports.authenticate = exports.incrementTokenCount = exports.incrementPromptCount = exports.upsertUser = exports.getUsers = exports.getUser = exports.createUser = exports.init = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const node_schedule_1 = __importDefault(require("node-schedule"));
const uuid_1 = require("uuid");
const config_1 = require("../../config");
const logger_1 = require("../../logger");
const firebase_1 = require("../firebase");
const models_1 = require("../models");
const utils_1 = require("../utils");
const log = logger_1.logger.child({ module: "users" });
const INITIAL_TOKENS = models_1.MODEL_FAMILIES.reduce((acc, family) => ({ ...acc, [family]: 0 }), {});
const users = new Map();
const usersToFlush = new Set();
let quotaRefreshJob = null;
let userCleanupJob = null;
async function init() {
    log.info({ store: config_1.config.gatekeeperStore }, "Initializing user store...");
    if (config_1.config.gatekeeperStore === "firebase_rtdb") {
        await initFirebase();
    }
    if (config_1.config.quotaRefreshPeriod) {
        const crontab = getRefreshCrontab();
        quotaRefreshJob = node_schedule_1.default.scheduleJob(crontab, refreshAllQuotas);
        if (!quotaRefreshJob) {
            throw new Error("Unable to schedule quota refresh. Is QUOTA_REFRESH_PERIOD set correctly?");
        }
        log.debug({ nextRefresh: quotaRefreshJob.nextInvocation() }, "Scheduled token quota refresh.");
    }
    userCleanupJob = node_schedule_1.default.scheduleJob("* * * * *", cleanupExpiredTokens);
    log.info("User store initialized.");
}
exports.init = init;
/**
 * Creates a new user and returns their token. Optionally accepts parameters
 * for setting an expiry date and/or token limits for temporary users.
 **/
function createUser(createOptions) {
    const token = (0, uuid_1.v4)();
    const newUser = {
        token,
        ip: [],
        type: "normal",
        promptCount: 0,
        tokenCounts: { ...INITIAL_TOKENS },
        tokenLimits: createOptions?.tokenLimits ?? { ...config_1.config.tokenQuota },
        tokenRefresh: createOptions?.tokenRefresh ?? { ...INITIAL_TOKENS },
        createdAt: Date.now(),
        meta: {},
    };
    if (createOptions?.type === "temporary") {
        Object.assign(newUser, {
            type: "temporary",
            expiresAt: createOptions.expiresAt,
        });
    }
    else {
        Object.assign(newUser, { type: createOptions?.type ?? "normal" });
    }
    users.set(token, newUser);
    usersToFlush.add(token);
    return token;
}
exports.createUser = createUser;
/** Returns the user with the given token if they exist. */
function getUser(token) {
    return users.get(token);
}
exports.getUser = getUser;
/** Returns a list of all users. */
function getUsers() {
    return Array.from(users.values()).map((user) => ({ ...user }));
}
exports.getUsers = getUsers;
/**
 * Upserts the given user. Intended for use with the /admin API for updating
 * arbitrary fields on a user; use the other functions in this module for
 * specific use cases. `undefined` values are left unchanged. `null` will delete
 * the property from the user.
 *
 * Returns the upserted user.
 */
function upsertUser(user) {
    const existing = users.get(user.token) ?? {
        token: user.token,
        ip: [],
        type: "normal",
        promptCount: 0,
        tokenCounts: { ...INITIAL_TOKENS },
        tokenLimits: { ...config_1.config.tokenQuota },
        tokenRefresh: { ...INITIAL_TOKENS },
        createdAt: Date.now(),
        meta: {},
    };
    const updates = {};
    for (const field of Object.entries(user)) {
        const [key, value] = field; // already validated by zod
        if (value === undefined || key === "token")
            continue;
        if (value === null) {
            delete existing[key];
        }
        else {
            updates[key] = value;
        }
    }
    if (updates.tokenCounts) {
        for (const family of models_1.MODEL_FAMILIES) {
            updates.tokenCounts[family] ??= 0;
        }
    }
    if (updates.tokenLimits) {
        for (const family of models_1.MODEL_FAMILIES) {
            updates.tokenLimits[family] ??= 0;
        }
    }
    // tokenRefresh is a special case where we want to merge the existing and
    // updated values for each model family, ignoring falsy values.
    if (updates.tokenRefresh) {
        const merged = { ...existing.tokenRefresh };
        for (const family of models_1.MODEL_FAMILIES) {
            merged[family] =
                updates.tokenRefresh[family] || existing.tokenRefresh[family];
        }
        updates.tokenRefresh = merged;
    }
    users.set(user.token, Object.assign(existing, updates));
    usersToFlush.add(user.token);
    // Immediately schedule a flush to the database if we're using Firebase.
    if (config_1.config.gatekeeperStore === "firebase_rtdb") {
        setImmediate(flushUsers);
    }
    return users.get(user.token);
}
exports.upsertUser = upsertUser;
/** Increments the prompt count for the given user. */
function incrementPromptCount(token) {
    const user = users.get(token);
    if (!user)
        return;
    user.promptCount++;
    usersToFlush.add(token);
}
exports.incrementPromptCount = incrementPromptCount;
/** Increments token consumption for the given user and model. */
function incrementTokenCount(token, model, api, consumption) {
    const user = users.get(token);
    if (!user)
        return;
    const modelFamily = getModelFamilyForQuotaUsage(model, api);
    const existing = user.tokenCounts[modelFamily] ?? 0;
    user.tokenCounts[modelFamily] = existing + consumption;
    usersToFlush.add(token);
}
exports.incrementTokenCount = incrementTokenCount;
/**
 * Given a user's token and IP address, authenticates the user and adds the IP
 * to the user's list of IPs. Returns the user if they exist and are not
 * disabled, otherwise returns undefined.
 */
function authenticate(token, ip) {
    const user = users.get(token);
    if (!user)
        return { result: "not_found" };
    if (user.disabledAt)
        return { result: "disabled" };
    const newIp = !user.ip.includes(ip);
    const userLimit = user.maxIps ?? config_1.config.maxIpsPerUser;
    const enforcedLimit = user.type === "special" || !userLimit ? Infinity : userLimit;
    if (newIp && user.ip.length >= enforcedLimit) {
        if (config_1.config.maxIpsAutoBan) {
            user.ip.push(ip);
            disableUser(token, "IP address limit exceeded.");
            return { result: "disabled" };
        }
        return { result: "limited" };
    }
    else if (newIp) {
        user.ip.push(ip);
    }
    user.lastUsedAt = Date.now();
    usersToFlush.add(token);
    return { user, result: "success" };
}
exports.authenticate = authenticate;
function hasAvailableQuota({ userToken, model, api, requested, }) {
    const user = users.get(userToken);
    if (!user)
        return false;
    if (user.type === "special")
        return true;
    const modelFamily = getModelFamilyForQuotaUsage(model, api);
    const { tokenCounts, tokenLimits } = user;
    const tokenLimit = tokenLimits[modelFamily];
    if (!tokenLimit)
        return true;
    const tokensConsumed = (tokenCounts[modelFamily] ?? 0) + requested;
    return tokensConsumed < tokenLimit;
}
exports.hasAvailableQuota = hasAvailableQuota;
/**
 * For the given user, sets token limits for each model family to the sum of the
 * current count and the refresh amount, up to the default limit. If a quota is
 * not specified for a model family, it is not touched.
 */
function refreshQuota(token) {
    const user = users.get(token);
    if (!user)
        return;
    const { tokenQuota } = config_1.config;
    const { tokenCounts, tokenLimits, tokenRefresh } = user;
    // Get default quotas for each model family.
    const defaultQuotas = Object.entries(tokenQuota);
    // If any user-specific refresh quotas are present, override default quotas.
    const userQuotas = defaultQuotas.map(([f, q]) => [f, (tokenRefresh[f] ?? 0) || q] /* narrow to tuple */);
    userQuotas
        // Ignore families with no global or user-specific refresh quota.
        .filter(([, q]) => q > 0)
        // Increase family token limit by the family's refresh amount.
        .forEach(([f, q]) => (tokenLimits[f] = (tokenCounts[f] ?? 0) + q));
    usersToFlush.add(token);
}
exports.refreshQuota = refreshQuota;
function resetUsage(token) {
    const user = users.get(token);
    if (!user)
        return;
    const { tokenCounts } = user;
    const counts = Object.entries(tokenCounts);
    counts.forEach(([model]) => (tokenCounts[model] = 0));
    usersToFlush.add(token);
}
exports.resetUsage = resetUsage;
/** Disables the given user, optionally providing a reason. */
function disableUser(token, reason) {
    const user = users.get(token);
    if (!user)
        return;
    user.disabledAt = Date.now();
    user.disabledReason = reason;
    if (!user.meta) {
        user.meta = {};
    }
    // manually banned tokens cannot be refreshed
    user.meta.refreshable = false;
    usersToFlush.add(token);
}
exports.disableUser = disableUser;
function getNextQuotaRefresh() {
    if (!quotaRefreshJob)
        return "never (manual refresh only)";
    return quotaRefreshJob.nextInvocation().getTime();
}
exports.getNextQuotaRefresh = getNextQuotaRefresh;
/**
 * Cleans up expired temporary tokens by disabling tokens past their access
 * expiry date and permanently deleting tokens three days after their access
 * expiry date.
 */
function cleanupExpiredTokens() {
    const now = Date.now();
    let disabled = 0;
    let deleted = 0;
    for (const user of users.values()) {
        if (user.type !== "temporary")
            continue;
        if (user.expiresAt && user.expiresAt < now && !user.disabledAt) {
            disableUser(user.token, "Temporary token expired.");
            if (!user.meta) {
                user.meta = {};
            }
            user.meta.refreshable = config_1.config.captchaMode !== "none";
            disabled++;
        }
        const purgeTimeout = config_1.config.powTokenPurgeHours * 60 * 60 * 1000;
        if (user.disabledAt && user.disabledAt + purgeTimeout < now) {
            users.delete(user.token);
            usersToFlush.add(user.token);
            deleted++;
        }
    }
    log.trace({ disabled, deleted }, "Expired tokens cleaned up.");
}
function refreshAllQuotas() {
    let count = 0;
    for (const user of users.values()) {
        if (user.type === "temporary")
            continue;
        refreshQuota(user.token);
        count++;
    }
    log.info({ refreshed: count, nextRefresh: quotaRefreshJob.nextInvocation() }, "Token quotas refreshed.");
}
// TODO: Firebase persistence is pretend right now and just polls the in-memory
// store to sync it with Firebase when it changes. Will refactor to abstract
// persistence layer later so we can support multiple stores.
let firebaseTimeout;
const USERS_REF = process.env.FIREBASE_USERS_REF_NAME ?? "users";
async function initFirebase() {
    log.info("Connecting to Firebase...");
    const app = (0, firebase_1.getFirebaseApp)();
    const db = firebase_admin_1.default.database(app);
    const usersRef = db.ref(USERS_REF);
    const snapshot = await usersRef.once("value");
    const users = snapshot.val();
    firebaseTimeout = setInterval(flushUsers, 20 * 1000);
    if (!users) {
        log.info("No users found in Firebase.");
        return;
    }
    for (const token in users) {
        upsertUser(users[token]);
    }
    usersToFlush.clear();
    const numUsers = Object.keys(users).length;
    log.info({ users: numUsers }, "Loaded users from Firebase");
}
async function flushUsers() {
    const app = (0, firebase_1.getFirebaseApp)();
    const db = firebase_admin_1.default.database(app);
    const usersRef = db.ref(USERS_REF);
    const updates = {};
    const deletions = [];
    for (const token of usersToFlush) {
        const user = users.get(token);
        if (!user) {
            deletions.push(token);
            continue;
        }
        updates[token] = user;
    }
    usersToFlush.clear();
    const numUpdates = Object.keys(updates).length + deletions.length;
    if (numUpdates === 0) {
        return;
    }
    await usersRef.update(updates);
    await Promise.all(deletions.map((token) => usersRef.child(token).remove()));
    log.info({ users: Object.keys(updates).length, deletions: deletions.length }, "Flushed changes to Firebase");
}
function getModelFamilyForQuotaUsage(model, api) {
    // "azure" here is added to model names by the Azure key provider to
    // differentiate between Azure and OpenAI variants of the same model.
    if (model.includes("azure"))
        return (0, models_1.getAzureOpenAIModelFamily)(model);
    if (model.includes("anthropic."))
        return (0, models_1.getAwsBedrockModelFamily)(model);
    if (model.startsWith("claude-") && model.includes("@"))
        return (0, models_1.getGcpModelFamily)(model);
    switch (api) {
        case "openai":
        case "openai-text":
        case "openai-image":
            return (0, models_1.getOpenAIModelFamily)(model);
        case "anthropic-chat":
        case "anthropic-text":
            return (0, models_1.getClaudeModelFamily)(model);
        case "google-ai":
            return (0, models_1.getGoogleAIModelFamily)(model);
        case "mistral-ai":
        case "mistral-text":
            return (0, models_1.getMistralAIModelFamily)(model);
        default:
            (0, utils_1.assertNever)(api);
    }
}
function getRefreshCrontab() {
    switch (config_1.config.quotaRefreshPeriod) {
        case "hourly":
            return "0 * * * *";
        case "daily":
            return "0 0 * * *";
        default:
            return config_1.config.quotaRefreshPeriod ?? "0 0 * * *";
    }
}
//# sourceMappingURL=user-store.js.map
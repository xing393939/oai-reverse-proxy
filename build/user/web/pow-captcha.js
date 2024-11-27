"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.powRouter = exports.invalidatePowChallenges = void 0;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importDefault(require("express"));
const argon2_1 = __importDefault(require("@node-rs/argon2"));
const zod_1 = require("zod");
const hmac_signing_1 = require("../../shared/hmac-signing");
const user_store_1 = require("../../shared/users/user-store");
const config_1 = require("../../config");
/** Lockout time after verification in milliseconds */
const LOCKOUT_TIME = 1000 * 60; // 60 seconds
let powKeySalt = crypto_1.default.randomBytes(32).toString("hex");
/**
 * Invalidates any outstanding unsolved challenges.
 */
function invalidatePowChallenges() {
    powKeySalt = crypto_1.default.randomBytes(32).toString("hex");
}
exports.invalidatePowChallenges = invalidatePowChallenges;
const argon2Params = {
    ARGON2_TIME_COST: parseInt(process.env.ARGON2_TIME_COST || "8"),
    ARGON2_MEMORY_KB: parseInt(process.env.ARGON2_MEMORY_KB || String(1024 * 64)),
    ARGON2_PARALLELISM: parseInt(process.env.ARGON2_PARALLELISM || "1"),
    ARGON2_HASH_LENGTH: parseInt(process.env.ARGON2_HASH_LENGTH || "32"),
};
/**
 * Work factor for each difficulty. This is the expected number of hashes that
 * will be computed to solve the challenge, on average. The actual number of
 * hashes will vary due to randomness.
 */
const workFactors = { extreme: 4000, high: 1900, medium: 900, low: 200 };
const verifySchema = zod_1.z.object({
    challenge: zod_1.z.object({
        s: zod_1.z
            .string()
            .min(1)
            .max(64)
            .regex(/^[0-9a-f]+$/),
        hl: zod_1.z.number().int().positive().max(64),
        t: zod_1.z.number().int().positive().min(2).max(10),
        m: zod_1.z
            .number()
            .int()
            .positive()
            .max(1024 * 1024 * 2),
        p: zod_1.z.number().int().positive().max(16),
        d: zod_1.z.string().regex(/^[0-9]+n$/),
        e: zod_1.z.number().int().positive(),
        ip: zod_1.z.string().min(1).max(64).optional(),
        v: zod_1.z.literal(1).optional(),
        token: zod_1.z.string().min(1).max(64).optional(),
    }),
    solution: zod_1.z.string().min(1).max(64),
    signature: zod_1.z.string().min(1),
    proxyKey: zod_1.z.string().min(1).max(1024).optional(),
});
const challengeSchema = zod_1.z.object({
    action: zod_1.z.union([zod_1.z.literal("new"), zod_1.z.literal("refresh")]),
    refreshToken: zod_1.z.string().min(1).max(64).optional(),
    proxyKey: zod_1.z.string().min(1).max(1024).optional(),
});
/** Solutions by timestamp */
const solves = new Map();
/** Recent attempts by IP address */
const recentAttempts = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamp] of recentAttempts) {
        if (now - timestamp > LOCKOUT_TIME) {
            recentAttempts.delete(ip);
        }
    }
    for (const [key, timestamp] of solves) {
        if (now - timestamp > config_1.config.powChallengeTimeout * 1000 * 60) {
            solves.delete(key);
        }
    }
}, 1000);
function generateChallenge(clientIp, token) {
    let workFactor = (typeof config_1.config.powDifficultyLevel === "number"
        ? config_1.config.powDifficultyLevel
        : workFactors[config_1.config.powDifficultyLevel]) || 1000;
    // If this is a token refresh, halve the work factor
    if (token) {
        workFactor = Math.floor(workFactor / 2);
    }
    const hashBits = BigInt(argon2Params.ARGON2_HASH_LENGTH) * 8n;
    const hashMax = 2n ** hashBits;
    const targetValue = hashMax / BigInt(workFactor);
    return {
        s: crypto_1.default.randomBytes(32).toString("hex"),
        hl: argon2Params.ARGON2_HASH_LENGTH,
        t: argon2Params.ARGON2_TIME_COST,
        m: argon2Params.ARGON2_MEMORY_KB,
        p: argon2Params.ARGON2_PARALLELISM,
        d: targetValue.toString() + "n",
        e: Date.now() + config_1.config.powChallengeTimeout * 1000 * 60,
        ip: clientIp,
        token,
    };
}
async function verifySolution(challenge, solution, logger) {
    logger.info({ solution, challenge }, "Verifying solution");
    const hash = await argon2_1.default.hashRaw(String(solution), {
        salt: Buffer.from(challenge.s, "hex"),
        outputLen: challenge.hl,
        timeCost: challenge.t,
        memoryCost: challenge.m,
        parallelism: challenge.p,
        algorithm: 2 /* argon2.Algorithm.Argon2id */,
    });
    const hashStr = hash.toString("hex");
    const target = BigInt(challenge.d.slice(0, -1));
    const hashValue = BigInt("0x" + hashStr);
    const result = hashValue <= target;
    logger.info({ hashStr, target, hashValue, result }, "Solution verified");
    return result;
}
function verifyTokenRefreshable(token, req) {
    const ip = req.ip;
    const user = (0, user_store_1.getUser)(token);
    if (!user) {
        req.log.warn({ token }, "Cannot refresh token - not found");
        return false;
    }
    if (user.type !== "temporary") {
        req.log.warn({ token }, "Cannot refresh token - wrong token type");
        return false;
    }
    if (!user.meta?.refreshable) {
        req.log.warn({ token }, "Cannot refresh token - not refreshable");
        return false;
    }
    if (!user.ip.includes(ip)) {
        // If there are available slots, add the IP to the list
        const { result } = (0, user_store_1.authenticate)(token, ip);
        if (result === "limited") {
            req.log.warn({ token, ip }, "Cannot refresh token - IP limit reached");
            return false;
        }
    }
    req.log.info({ token: `...${token.slice(-5)}` }, "Allowing token refresh");
    return true;
}
const router = express_1.default.Router();
exports.powRouter = router;
router.post("/challenge", (req, res) => {
    const data = challengeSchema.safeParse(req.body);
    if (!data.success) {
        res
            .status(400)
            .json({ error: "Invalid challenge request", details: data.error });
        return;
    }
    const { action, refreshToken, proxyKey } = data.data;
    if (config_1.config.proxyKey && proxyKey !== config_1.config.proxyKey) {
        res.status(401).json({ error: "Invalid proxy password" });
        return;
    }
    if (action === "refresh") {
        if (!refreshToken || !verifyTokenRefreshable(refreshToken, req)) {
            res.status(400).json({
                error: "Not allowed to refresh that token; request a new one",
            });
            return;
        }
        const challenge = generateChallenge(req.ip, refreshToken);
        const signature = (0, hmac_signing_1.signMessage)(challenge, powKeySalt);
        res.json({ challenge, signature });
    }
    else {
        const challenge = generateChallenge(req.ip);
        const signature = (0, hmac_signing_1.signMessage)(challenge, powKeySalt);
        res.json({ challenge, signature });
    }
});
router.post("/verify", async (req, res) => {
    const ip = req.ip;
    req.log.info("Got verification request");
    if (recentAttempts.has(ip)) {
        const error = "Rate limited; wait a minute before trying again";
        req.log.info({ error }, "Verification rejected");
        res.status(429).json({ error });
        return;
    }
    const result = verifySchema.safeParse(req.body);
    if (!result.success) {
        const error = "Invalid verify request";
        req.log.info({ error, result }, "Verification rejected");
        res.status(400).json({ error, details: result.error });
        return;
    }
    const { challenge, signature, solution } = result.data;
    if ((0, hmac_signing_1.signMessage)(challenge, powKeySalt) !== signature) {
        const error = "Invalid signature; server may have restarted since challenge was issued. Please request a new challenge.";
        req.log.info({ error }, "Verification rejected");
        res.status(400).json({ error });
        return;
    }
    if (config_1.config.proxyKey && result.data.proxyKey !== config_1.config.proxyKey) {
        const error = "Invalid proxy password";
        req.log.info({ error }, "Verification rejected");
        res.status(401).json({ error, password: result.data.proxyKey });
        return;
    }
    if (challenge.ip && challenge.ip !== ip) {
        const error = "Solution must be verified from original IP address";
        req.log.info({ error, challengeIp: challenge.ip, clientIp: ip }, "Verification rejected");
        res.status(400).json({ error });
        return;
    }
    if (solves.has(signature)) {
        const error = "Reused signature";
        req.log.info({ error }, "Verification rejected");
        res.status(400).json({ error });
        return;
    }
    if (Date.now() > challenge.e) {
        const error = "Verification took too long";
        req.log.info({ error }, "Verification rejected");
        res.status(400).json({ error });
        return;
    }
    if (challenge.token && !verifyTokenRefreshable(challenge.token, req)) {
        res.status(400).json({ error: "Not allowed to refresh that usertoken" });
        return;
    }
    recentAttempts.set(ip, Date.now());
    try {
        const success = await verifySolution(challenge, solution, req.log);
        if (!success) {
            recentAttempts.set(ip, Date.now() + 1000 * 60 * 60 * 6);
            req.log.warn("Bogus solution, client blocked");
            res.status(400).json({ error: "Solution failed verification" });
            return;
        }
        solves.set(signature, Date.now());
    }
    catch (err) {
        req.log.error(err, "Error verifying proof-of-work");
        res.status(500).json({ error: "Internal error" });
        return;
    }
    if (challenge.token) {
        const user = (0, user_store_1.getUser)(challenge.token);
        if (user) {
            (0, user_store_1.upsertUser)({
                token: challenge.token,
                expiresAt: Date.now() + config_1.config.powTokenHours * 60 * 60 * 1000,
                disabledAt: null,
                disabledReason: null,
            });
            req.log.info({ token: `...${challenge.token.slice(-5)}` }, "Token refreshed");
            return res.json({ success: true, token: challenge.token });
        }
    }
    else {
        const newToken = issueToken(req);
        return res.json({ success: true, token: newToken });
    }
});
router.get("/", (_req, res) => {
    res.render("user_request_token", {
        keyRequired: !!config_1.config.proxyKey,
        difficultyLevel: config_1.config.powDifficultyLevel,
        tokenLifetime: config_1.config.powTokenHours,
        tokenMaxIps: config_1.config.powTokenMaxIps,
        challengeTimeout: config_1.config.powChallengeTimeout,
    });
});
// const ipTokenCache = new Map<string, Set<string>>();
//
// function buildIpTokenCountCache() {
//   ipTokenCache.clear();
//   const users = getUsers().filter((u) => u.type === "temporary");
//   for (const user of users) {
//     for (const ip of user.ip) {
//       if (!ipTokenCache.has(ip)) {
//         ipTokenCache.set(ip, new Set());
//       }
//       ipTokenCache.get(ip)?.add(user.token);
//     }
//   }
// }
function issueToken(req) {
    const token = (0, user_store_1.createUser)({
        type: "temporary",
        expiresAt: Date.now() + config_1.config.powTokenHours * 60 * 60 * 1000,
    });
    (0, user_store_1.upsertUser)({
        token,
        ip: [req.ip],
        maxIps: config_1.config.powTokenMaxIps,
        meta: { refreshable: true },
    });
    req.log.info({ ip: req.ip, token: `...${token.slice(-5)}` }, "Proof-of-work token issued");
    return token;
}
//# sourceMappingURL=pow-captcha.js.map
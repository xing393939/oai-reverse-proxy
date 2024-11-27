"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserPartialSchema = exports.UserSchema = exports.tokenCountsSchema = void 0;
const zod_1 = require("zod");
const models_1 = require("../models");
const utils_1 = require("../utils");
// This just dynamically creates a Zod object type with a key for each model
// family and an optional number value.
exports.tokenCountsSchema = zod_1.z.object(models_1.MODEL_FAMILIES.reduce((acc, family) => ({ ...acc, [family]: zod_1.z.number().optional().default(0) }), {}));
exports.UserSchema = zod_1.z
    .object({
    /** User's personal access token. */
    token: zod_1.z.string(),
    /** IP addresses the user has connected from. */
    ip: zod_1.z.array(zod_1.z.string()),
    /** User's nickname. */
    nickname: zod_1.z.string().max(80).optional(),
    /**
     * The user's privilege level.
     * - `normal`: Default role. Subject to usual rate limits and quotas.
     * - `special`: Special role. Higher quotas and exempt from
     *   auto-ban/lockout.
     **/
    type: zod_1.z.enum(["normal", "special", "temporary"]),
    /** Number of prompts the user has made. */
    promptCount: zod_1.z.number(),
    /**
     * @deprecated Use `tokenCounts` instead.
     * Never used; retained for backwards compatibility.
     */
    tokenCount: zod_1.z.any().optional(),
    /** Number of tokens the user has consumed, by model family. */
    tokenCounts: exports.tokenCountsSchema,
    /** Maximum number of tokens the user can consume, by model family. */
    tokenLimits: exports.tokenCountsSchema,
    /** User-specific token refresh amount, by model family. */
    tokenRefresh: exports.tokenCountsSchema,
    /** Time at which the user was created. */
    createdAt: zod_1.z.number(),
    /** Time at which the user last connected. */
    lastUsedAt: zod_1.z.number().optional(),
    /** Time at which the user was disabled, if applicable. */
    disabledAt: zod_1.z.number().optional(),
    /** Reason for which the user was disabled, if applicable. */
    disabledReason: zod_1.z.string().optional(),
    /** Time at which the user will expire and be disabled (for temp users). */
    expiresAt: zod_1.z.number().optional(),
    /** The user's maximum number of IP addresses; supercedes global max. */
    maxIps: zod_1.z.coerce.number().int().min(0).optional(),
    /** Private note about the user. */
    adminNote: zod_1.z.string().optional(),
    meta: zod_1.z.record(zod_1.z.any()).optional(),
})
    .strict();
/**
 * Variant of `UserSchema` which allows for partial updates, and makes any
 * optional properties on the base schema nullable. Null values are used to
 * indicate that the property should be deleted from the user object.
 */
exports.UserPartialSchema = (0, utils_1.makeOptionalPropsNullable)(exports.UserSchema)
    .partial()
    .extend({ token: zod_1.z.string() });
//# sourceMappingURL=schema.js.map
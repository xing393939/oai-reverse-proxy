"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersApiRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const userStore = __importStar(require("../../shared/users/user-store"));
const utils_1 = require("../../shared/utils");
const schema_1 = require("../../shared/users/schema");
const router = (0, express_1.Router)();
exports.usersApiRouter = router;
/**
 * Returns a list of all users, sorted by prompt count and then last used time.
 * GET /admin/users
 */
router.get("/", (req, res) => {
    const sort = (0, utils_1.parseSort)(req.query.sort) || ["promptCount", "lastUsedAt"];
    const users = userStore.getUsers().sort((0, utils_1.sortBy)(sort, false));
    res.json({ users, count: users.length });
});
/**
 * Returns the user with the given token.
 * GET /admin/users/:token
 */
router.get("/:token", (req, res) => {
    const user = userStore.getUser(req.params.token);
    if (!user) {
        return res.status(404).json({ error: "Not found" });
    }
    res.json(user);
});
/**
 * Creates a new user.
 * Optionally accepts a JSON body containing `type`, and for temporary-type
 * users, `tokenLimits` and `expiresAt` fields.
 * Returns the created user's token.
 * POST /admin/users
 */
router.post("/", (req, res) => {
    const body = req.body;
    const base = zod_1.z.object({
        type: schema_1.UserSchema.shape.type.exclude(["temporary"]).default("normal"),
    });
    const tempUser = base
        .extend({
        type: zod_1.z.literal("temporary"),
        expiresAt: schema_1.UserSchema.shape.expiresAt,
        tokenLimits: schema_1.UserSchema.shape.tokenLimits,
    })
        .required();
    const schema = zod_1.z.union([base, tempUser]);
    const result = schema.safeParse(body);
    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }
    const token = userStore.createUser({ ...result.data });
    res.json({ token });
});
/**
 * Updates the user with the given token, creating them if they don't exist.
 * Accepts a JSON body containing at least one field on the User type.
 * Returns the upserted user.
 * PUT /admin/users/:token
 */
router.put("/:token", (req, res) => {
    const result = schema_1.UserPartialSchema.safeParse({
        ...req.body,
        token: req.params.token,
    });
    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }
    userStore.upsertUser(result.data);
    res.json(userStore.getUser(req.params.token));
});
/**
 * Bulk-upserts users given a list of User updates.
 * Accepts a JSON body with the field `users` containing an array of updates.
 * Returns an object containing the upserted users and the number of upserts.
 * PUT /admin/users
 */
router.put("/", (req, res) => {
    const result = zod_1.z.array(schema_1.UserPartialSchema).safeParse(req.body.users);
    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }
    const upserts = result.data.map((user) => userStore.upsertUser(user));
    res.json({ upserted_users: upserts, count: upserts.length });
});
/**
 * Disables the user with the given token. Optionally accepts a `disabledReason`
 * query parameter.
 * Returns the disabled user.
 * DELETE /admin/users/:token
 */
router.delete("/:token", (req, res) => {
    const user = userStore.getUser(req.params.token);
    const disabledReason = zod_1.z
        .string()
        .optional()
        .safeParse(req.query.disabledReason);
    if (!disabledReason.success) {
        return res.status(400).json({ error: disabledReason.error });
    }
    if (!user) {
        return res.status(404).json({ error: "Not found" });
    }
    userStore.disableUser(req.params.token, disabledReason.data);
    res.json(userStore.getUser(req.params.token));
});
//# sourceMappingURL=users.js.map
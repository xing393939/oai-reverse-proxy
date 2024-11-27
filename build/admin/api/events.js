"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventsApiRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const utils_1 = require("../../shared/utils");
const event_1 = require("../../shared/database/repos/event");
const router = (0, express_1.Router)();
exports.eventsApiRouter = router;
/**
 * Returns events for the given user token.
 * GET /admin/events/:token
 * @query first - The number of events to return.
 * @query after - The cursor to start returning events from (exclusive).
 */
router.get("/:token", (req, res) => {
    const schema = zod_1.z.object({
        token: zod_1.z.string(),
        first: zod_1.z.coerce.number().int().positive().max(200).default(25),
        after: zod_1.z
            .string()
            .optional()
            .transform((v) => {
            try {
                return (0, utils_1.decodeCursor)(v);
            }
            catch {
                return null;
            }
        })
            .nullable(),
        sort: zod_1.z.string().optional(),
    });
    const args = schema.safeParse({ ...req.params, ...req.query });
    if (!args.success) {
        return res.status(400).json({ error: args.error });
    }
    const data = event_1.eventsRepo
        .getUserEvents(args.data.token, {
        limit: args.data.first,
        cursor: args.data.after,
    })
        .map((e) => ({ node: e, cursor: (0, utils_1.encodeCursor)(e.date) }));
    res.json({
        data,
        endCursor: data[data.length - 1]?.cursor,
    });
});
//# sourceMappingURL=events.js.map
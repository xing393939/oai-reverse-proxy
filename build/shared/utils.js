"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeCursor = exports.encodeCursor = exports.assertNever = exports.redactIp = exports.makeOptionalPropsNullable = exports.sanitizeAndTrim = exports.paginate = exports.sortBy = exports.parseSort = void 0;
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const zod_1 = require("zod");
function parseSort(sort) {
    if (!sort)
        return null;
    if (typeof sort === "string")
        return sort.split(",");
    if (Array.isArray(sort))
        return sort.splice(3);
    return null;
}
exports.parseSort = parseSort;
function sortBy(fields, asc = true) {
    return (a, b) => {
        for (const field of fields) {
            if (a[field] !== b[field]) {
                // always sort nulls to the end
                if (a[field] == null)
                    return 1;
                if (b[field] == null)
                    return -1;
                const valA = Array.isArray(a[field]) ? a[field].length : a[field];
                const valB = Array.isArray(b[field]) ? b[field].length : b[field];
                const result = valA < valB ? -1 : 1;
                return asc ? result : -result;
            }
        }
        return 0;
    };
}
exports.sortBy = sortBy;
function paginate(set, page, pageSize = 20) {
    const p = Math.max(1, Math.min(page, Math.ceil(set.length / pageSize)));
    return {
        page: p,
        items: set.slice((p - 1) * pageSize, p * pageSize),
        pageSize,
        pageCount: Math.ceil(set.length / pageSize),
        totalCount: set.length,
        nextPage: p * pageSize < set.length ? p + 1 : null,
        prevPage: p > 1 ? p - 1 : null,
    };
}
exports.paginate = paginate;
function sanitizeAndTrim(input, options = {
    allowedTags: [],
    allowedAttributes: {},
}) {
    return (0, sanitize_html_1.default)((input ?? "").trim(), options);
}
exports.sanitizeAndTrim = sanitizeAndTrim;
// https://github.com/colinhacks/zod/discussions/2050#discussioncomment-5018870
function makeOptionalPropsNullable(schema) {
    const entries = Object.entries(schema.shape);
    const newProps = entries.reduce((acc, [key, value]) => {
        acc[key] =
            value instanceof zod_1.z.ZodOptional ? value.unwrap().nullable() : value;
        return acc;
    }, {});
    return zod_1.z.object(newProps);
}
exports.makeOptionalPropsNullable = makeOptionalPropsNullable;
function redactIp(ip) {
    const ipv6 = ip.includes(":");
    return ipv6 ? "redacted:ipv6" : ip.replace(/\.\d+\.\d+$/, ".xxx.xxx");
}
exports.redactIp = redactIp;
function assertNever(x) {
    throw new Error(`Called assertNever with argument ${x}.`);
}
exports.assertNever = assertNever;
function encodeCursor(v) {
    return Buffer.from(JSON.stringify(v)).toString("base64");
}
exports.encodeCursor = encodeCursor;
function decodeCursor(cursor) {
    if (!cursor)
        return null;
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
}
exports.decodeCursor = decodeCursor;
//# sourceMappingURL=utils.js.map
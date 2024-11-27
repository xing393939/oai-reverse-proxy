"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.languageFilter = void 0;
const config_1 = require("../../../../config");
const utils_1 = require("../../../../shared/utils");
const errors_1 = require("../../../../shared/errors");
const api_schemas_1 = require("../../../../shared/api-schemas");
const rejectedClients = new Map();
setInterval(() => {
    rejectedClients.forEach((count, ip) => {
        if (count > 0) {
            rejectedClients.set(ip, Math.floor(count / 2));
        }
        else {
            rejectedClients.delete(ip);
        }
    });
}, 30000);
/**
 * Block requests containing blacklisted phrases. Repeated rejections from the
 * same IP address will be throttled.
 */
const languageFilter = async (req) => {
    if (!config_1.config.rejectPhrases.length)
        return;
    const prompt = getPromptFromRequest(req);
    const match = config_1.config.rejectPhrases.find((phrase) => prompt.match(new RegExp(phrase, "i")));
    if (match) {
        const ip = req.ip;
        const rejections = (rejectedClients.get(req.ip) || 0) + 1;
        const delay = Math.min(60000, Math.pow(2, rejections - 1) * 1000);
        rejectedClients.set(ip, rejections);
        req.log.warn({ match, ip, rejections, delay }, "Prompt contains rejected phrase");
        await new Promise((resolve) => {
            req.res.once("close", resolve);
            setTimeout(resolve, delay);
        });
        throw new errors_1.BadRequestError(config_1.config.rejectMessage);
    }
};
exports.languageFilter = languageFilter;
/*
TODO: this is not type safe and does not raise errors if request body zod schema
is changed.
*/
function getPromptFromRequest(req) {
    const service = req.outboundApi;
    const body = req.body;
    switch (service) {
        case "anthropic-chat":
            return (0, api_schemas_1.flattenAnthropicMessages)(body.messages);
        case "openai":
        case "mistral-ai":
            return body.messages
                .map((msg) => {
                const text = Array.isArray(msg.content)
                    ? msg.content
                        .map((c) => {
                        if ("text" in c)
                            return c.text;
                    })
                        .join()
                    : msg.content;
                return `${msg.role}: ${text}`;
            })
                .join("\n\n");
        case "anthropic-text":
        case "openai-text":
        case "openai-image":
        case "mistral-text":
            return body.prompt;
        case "google-ai": {
            const b = body;
            return [
                b.systemInstruction?.parts.map((p) => p.text),
                ...b.contents.flatMap((c) => c.parts.map((p) => p.text)),
            ].join("\n");
        }
        default:
            (0, utils_1.assertNever)(service);
    }
}
//# sourceMappingURL=language-filter.js.map
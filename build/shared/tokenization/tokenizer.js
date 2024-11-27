"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countTokens = exports.init = void 0;
const utils_1 = require("../utils");
const claude_1 = require("./claude");
const openai_1 = require("./openai");
const mistral_1 = require("./mistral");
async function init() {
    (0, claude_1.init)();
    (0, openai_1.init)();
    (0, mistral_1.init)();
}
exports.init = init;
async function countTokens({ req, service, prompt, completion, }) {
    const time = process.hrtime();
    switch (service) {
        case "anthropic-chat":
        case "anthropic-text":
            return {
                ...(await (0, claude_1.getTokenCount)(prompt ?? completion)),
                tokenization_duration_ms: getElapsedMs(time),
            };
        case "openai":
        case "openai-text":
            return {
                ...(await (0, openai_1.getTokenCount)(prompt ?? completion, req.body.model)),
                tokenization_duration_ms: getElapsedMs(time),
            };
        case "openai-image":
            return {
                ...(0, openai_1.getOpenAIImageCost)({
                    model: req.body.model,
                    quality: req.body.quality,
                    resolution: req.body.size,
                    n: parseInt(req.body.n, 10) || null,
                }),
                tokenization_duration_ms: getElapsedMs(time),
            };
        case "google-ai":
            // TODO: Can't find a tokenization library for Gemini. There is an API
            // endpoint for it but it adds significant latency to the request.
            return {
                ...(0, openai_1.estimateGoogleAITokenCount)(prompt ?? (completion || [])),
                tokenization_duration_ms: getElapsedMs(time),
            };
        case "mistral-ai":
        case "mistral-text":
            return {
                ...(0, mistral_1.getTokenCount)(prompt ?? completion),
                tokenization_duration_ms: getElapsedMs(time),
            };
        default:
            (0, utils_1.assertNever)(service);
    }
}
exports.countTokens = countTokens;
function getElapsedMs(time) {
    const diff = process.hrtime(time);
    return diff[0] * 1000 + diff[1] / 1e6;
}
//# sourceMappingURL=tokenizer.js.map
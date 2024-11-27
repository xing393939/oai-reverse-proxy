"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateContextSize = void 0;
const zod_1 = require("zod");
const config_1 = require("../../../../config");
const utils_1 = require("../../../../shared/utils");
const CLAUDE_MAX_CONTEXT = config_1.config.maxContextTokensAnthropic;
const OPENAI_MAX_CONTEXT = config_1.config.maxContextTokensOpenAI;
// todo: make configurable
const GOOGLE_AI_MAX_CONTEXT = 1024000;
const MISTRAL_AI_MAX_CONTENT = 131072;
/**
 * Assigns `req.promptTokens` and `req.outputTokens` based on the request body
 * and outbound API format, which combined determine the size of the context.
 * If the context is too large, an error is thrown.
 * This preprocessor should run after any preprocessor that transforms the
 * request body.
 */
const validateContextSize = async (req) => {
    assertRequestHasTokenCounts(req);
    const promptTokens = req.promptTokens;
    const outputTokens = req.outputTokens;
    const contextTokens = promptTokens + outputTokens;
    const model = req.body.model;
    let proxyMax;
    switch (req.outboundApi) {
        case "openai":
        case "openai-text":
            proxyMax = OPENAI_MAX_CONTEXT;
            break;
        case "anthropic-chat":
        case "anthropic-text":
            proxyMax = CLAUDE_MAX_CONTEXT;
            break;
        case "google-ai":
            proxyMax = GOOGLE_AI_MAX_CONTEXT;
            break;
        case "mistral-ai":
        case "mistral-text":
            proxyMax = MISTRAL_AI_MAX_CONTENT;
            break;
        case "openai-image":
            return;
        default:
            (0, utils_1.assertNever)(req.outboundApi);
    }
    proxyMax ||= Number.MAX_SAFE_INTEGER;
    if (req.user?.type === "special") {
        req.log.debug("Special user, not enforcing proxy context limit.");
        proxyMax = Number.MAX_SAFE_INTEGER;
    }
    let modelMax;
    if (model.match(/gpt-3.5-turbo-16k/)) {
        modelMax = 16384;
    }
    else if (model.match(/^gpt-4o/)) {
        modelMax = 128000;
    }
    else if (model.match(/^chatgpt-4o/)) {
        modelMax = 128000;
    }
    else if (model.match(/gpt-4-turbo(-\d{4}-\d{2}-\d{2})?$/)) {
        modelMax = 131072;
    }
    else if (model.match(/gpt-4-turbo(-preview)?$/)) {
        modelMax = 131072;
    }
    else if (model.match(/gpt-4-(0125|1106)(-preview)?$/)) {
        modelMax = 131072;
    }
    else if (model.match(/^gpt-4(-\d{4})?-vision(-preview)?$/)) {
        modelMax = 131072;
    }
    else if (model.match(/^o1-mini(-\d{4}-\d{2}-\d{2})?$/)) {
        modelMax = 128000;
    }
    else if (model.match(/^o1(-preview)?(-\d{4}-\d{2}-\d{2})?$/)) {
        modelMax = 128000;
    }
    else if (model.match(/gpt-3.5-turbo/)) {
        modelMax = 16384;
    }
    else if (model.match(/gpt-4-32k/)) {
        modelMax = 32768;
    }
    else if (model.match(/gpt-4/)) {
        modelMax = 8192;
    }
    else if (model.match(/^claude-(?:instant-)?v1(?:\.\d)?-100k/)) {
        modelMax = 100000;
    }
    else if (model.match(/^claude-(?:instant-)?v1(?:\.\d)?$/)) {
        modelMax = 9000;
    }
    else if (model.match(/^claude-2\.0/)) {
        modelMax = 100000;
    }
    else if (model.match(/^claude-2/)) {
        modelMax = 200000;
    }
    else if (model.match(/^claude-3/)) {
        modelMax = 200000;
    }
    else if (model.match(/^gemini-/)) {
        modelMax = 1024000;
    }
    else if (model.match(/^anthropic\.claude-3/)) {
        modelMax = 200000;
    }
    else if (model.match(/^anthropic\.claude-v2:\d/)) {
        modelMax = 200000;
    }
    else if (model.match(/^anthropic\.claude/)) {
        modelMax = 100000;
    }
    else if (model.match(/tral/)) {
        // catches mistral, mixtral, codestral, mathstral, etc. mistral models have
        // no name convention and wildly different context windows so this is a
        // catch-all
        modelMax = MISTRAL_AI_MAX_CONTENT;
    }
    else {
        req.log.warn({ model }, "Unknown model, using 200k token limit.");
        modelMax = 200000;
    }
    const finalMax = Math.min(proxyMax, modelMax);
    zod_1.z.object({
        tokens: zod_1.z
            .number()
            .int()
            .max(finalMax, {
            message: `Your request exceeds the context size limit. (max: ${finalMax} tokens, requested: ${promptTokens} prompt + ${outputTokens} output = ${contextTokens} context tokens)`,
        }),
    }).parse({ tokens: contextTokens });
    req.log.debug({ promptTokens, outputTokens, contextTokens, modelMax, proxyMax }, "Prompt size validated");
    req.tokenizerInfo.prompt_tokens = promptTokens;
    req.tokenizerInfo.completion_tokens = outputTokens;
    req.tokenizerInfo.max_model_tokens = modelMax;
    req.tokenizerInfo.max_proxy_tokens = proxyMax;
};
exports.validateContextSize = validateContextSize;
function assertRequestHasTokenCounts(req) {
    zod_1.z.object({
        promptTokens: zod_1.z.number().int().min(1),
        outputTokens: zod_1.z.number().int().min(1),
    })
        .nonstrict()
        .parse({ promptTokens: req.promptTokens, outputTokens: req.outputTokens });
}
//# sourceMappingURL=validate-context-size.js.map
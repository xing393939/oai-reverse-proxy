"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logPrompt = void 0;
const config_1 = require("../../../config");
const prompt_logging_1 = require("../../../shared/prompt-logging");
const common_1 = require("../common");
const utils_1 = require("../../../shared/utils");
const api_schemas_1 = require("../../../shared/api-schemas");
/** If prompt logging is enabled, enqueues the prompt for logging. */
const logPrompt = async (_proxyRes, req, _res, responseBody) => {
    if (!config_1.config.promptLogging) {
        return;
    }
    if (typeof responseBody !== "object") {
        throw new Error("Expected body to be an object");
    }
    const loggable = (0, common_1.isTextGenerationRequest)(req) || (0, common_1.isImageGenerationRequest)(req);
    if (!loggable)
        return;
    const promptPayload = getPromptForRequest(req, responseBody);
    const promptFlattened = flattenMessages(promptPayload);
    const response = (0, common_1.getCompletionFromBody)(req, responseBody);
    const model = (0, common_1.getModelFromBody)(req, responseBody);
    prompt_logging_1.logQueue.enqueue({
        endpoint: req.inboundApi,
        promptRaw: JSON.stringify(promptPayload),
        promptFlattened,
        model,
        response,
    });
};
exports.logPrompt = logPrompt;
const getPromptForRequest = (req, responseBody) => {
    // Since the prompt logger only runs after the request has been proxied, we
    // can assume the body has already been transformed to the target API's
    // format.
    switch (req.outboundApi) {
        case "openai":
        case "mistral-ai":
            return req.body.messages;
        case "anthropic-chat":
            let system = req.body.system;
            if (Array.isArray(system)) {
                system = system
                    .map((m) => m.text)
                    .join("\n");
            }
            return { system, messages: req.body.messages };
        case "openai-text":
        case "anthropic-text":
        case "mistral-text":
            return req.body.prompt;
        case "openai-image":
            return {
                prompt: req.body.prompt,
                size: req.body.size,
                style: req.body.style,
                quality: req.body.quality,
                revisedPrompt: responseBody.data[0].revised_prompt,
            };
        case "google-ai":
            return { contents: req.body.contents };
        default:
            (0, utils_1.assertNever)(req.outboundApi);
    }
};
const flattenMessages = (val) => {
    if (typeof val === "string") {
        return val.trim();
    }
    if (isAnthropicChatPrompt(val)) {
        const { system, messages } = val;
        return `System: ${system}\n\n${(0, api_schemas_1.flattenAnthropicMessages)(messages)}`;
    }
    if (isGoogleAIChatPrompt(val)) {
        return val.contents
            .map(({ parts, role }) => {
            const text = parts.map((p) => p.text).join("\n");
            return `${role}: ${text}`;
        })
            .join("\n");
    }
    if (Array.isArray(val)) {
        return val
            .map(({ content, role }) => {
            const text = Array.isArray(content)
                ? content
                    .map((c) => {
                    if ("text" in c)
                        return c.text;
                    if ("image_url" in c)
                        return "(( Attached Image ))";
                    if ("source" in c)
                        return "(( Attached Image ))";
                    return "(( Unsupported Content ))";
                })
                    .join("\n")
                : content;
            return `${role}: ${text}`;
        })
            .join("\n");
    }
    return val.prompt.trim();
};
function isGoogleAIChatPrompt(val) {
    return typeof val === "object" && val !== null && "contents" in val;
}
function isAnthropicChatPrompt(val) {
    return (typeof val === "object" &&
        val !== null &&
        "system" in val &&
        "messages" in val);
}
//# sourceMappingURL=log-prompt.js.map
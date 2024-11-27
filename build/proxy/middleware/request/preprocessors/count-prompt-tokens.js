"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countPromptTokens = void 0;
const tokenization_1 = require("../../../../shared/tokenization");
const utils_1 = require("../../../../shared/utils");
/**
 * Given a request with an already-transformed body, counts the number of
 * tokens and assigns the count to the request.
 */
const countPromptTokens = async (req) => {
    const service = req.outboundApi;
    let result;
    switch (service) {
        case "openai": {
            req.outputTokens = req.body.max_completion_tokens || req.body.max_tokens;
            const prompt = req.body.messages;
            result = await (0, tokenization_1.countTokens)({ req, prompt, service });
            break;
        }
        case "openai-text": {
            req.outputTokens = req.body.max_tokens;
            const prompt = req.body.prompt;
            result = await (0, tokenization_1.countTokens)({ req, prompt, service });
            break;
        }
        case "anthropic-chat": {
            req.outputTokens = req.body.max_tokens;
            let system = req.body.system ?? "";
            if (Array.isArray(system)) {
                system = system
                    .map((m) => m.text)
                    .join("\n");
            }
            const prompt = { system, messages: req.body.messages };
            result = await (0, tokenization_1.countTokens)({ req, prompt, service });
            break;
        }
        case "anthropic-text": {
            req.outputTokens = req.body.max_tokens_to_sample;
            const prompt = req.body.prompt;
            result = await (0, tokenization_1.countTokens)({ req, prompt, service });
            break;
        }
        case "google-ai": {
            req.outputTokens = req.body.generationConfig.maxOutputTokens;
            const prompt = req.body.contents;
            result = await (0, tokenization_1.countTokens)({ req, prompt, service });
            break;
        }
        case "mistral-ai":
        case "mistral-text": {
            req.outputTokens = req.body.max_tokens;
            const prompt = req.body.messages ?? req.body.prompt;
            result = await (0, tokenization_1.countTokens)({ req, prompt, service });
            break;
        }
        case "openai-image": {
            req.outputTokens = 1;
            result = await (0, tokenization_1.countTokens)({ req, service });
            break;
        }
        default:
            (0, utils_1.assertNever)(service);
    }
    req.promptTokens = result.token_count;
    req.log.debug({ result: result }, "Counted prompt tokens.");
    req.tokenizerInfo = req.tokenizerInfo ?? {};
    req.tokenizerInfo = { ...req.tokenizerInfo, ...result };
};
exports.countPromptTokens = countPromptTokens;
//# sourceMappingURL=count-prompt-tokens.js.map
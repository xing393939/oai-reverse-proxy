"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleAIToOpenAI = void 0;
const parse_sse_1 = require("../parse-sse");
const logger_1 = require("../../../../../logger");
const log = logger_1.logger.child({
    module: "sse-transformer",
    transformer: "google-ai-to-openai",
});
/**
 * Transforms an incoming Google AI SSE to an equivalent OpenAI
 * chat.completion.chunk SSE.
 */
const googleAIToOpenAI = (params) => {
    const { data, index } = params;
    const rawEvent = (0, parse_sse_1.parseEvent)(data);
    if (!rawEvent.data || rawEvent.data === "[DONE]") {
        return { position: -1 };
    }
    const completionEvent = asCompletion(rawEvent);
    if (!completionEvent) {
        return { position: -1 };
    }
    const parts = completionEvent.candidates[0].content.parts;
    let content = parts[0]?.text ?? "";
    // If this is the first chunk, try stripping speaker names from the response
    // e.g. "John: Hello" -> "Hello"
    if (index === 0) {
        content = content.replace(/^(.*?): /, "").trim();
    }
    const newEvent = {
        id: "goo-" + params.fallbackId,
        object: "chat.completion.chunk",
        created: Date.now(),
        model: params.fallbackModel,
        choices: [
            {
                index: 0,
                delta: { content },
                finish_reason: completionEvent.candidates[0].finishReason ?? null,
            },
        ],
    };
    return { position: -1, event: newEvent };
};
exports.googleAIToOpenAI = googleAIToOpenAI;
function asCompletion(event) {
    try {
        const parsed = JSON.parse(event.data);
        if (parsed.candidates?.length > 0) {
            return parsed;
        }
        else {
            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Missing required fields");
        }
    }
    catch (error) {
        log.warn({ error: error.stack, event }, "Received invalid event");
    }
    return null;
}
//# sourceMappingURL=google-ai-to-openai.js.map
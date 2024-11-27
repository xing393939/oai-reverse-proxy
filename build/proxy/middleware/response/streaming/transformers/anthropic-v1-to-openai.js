"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropicV1ToOpenAI = void 0;
const parse_sse_1 = require("../parse-sse");
const logger_1 = require("../../../../../logger");
const log = logger_1.logger.child({
    module: "sse-transformer",
    transformer: "anthropic-v1-to-openai",
});
/**
 * Transforms an incoming Anthropic SSE (2023-01-01 API) to an equivalent
 * OpenAI chat.completion.chunk SSE.
 */
const anthropicV1ToOpenAI = (params) => {
    const { data, lastPosition } = params;
    const rawEvent = (0, parse_sse_1.parseEvent)(data);
    if (!rawEvent.data || rawEvent.data === "[DONE]") {
        return { position: lastPosition };
    }
    const completionEvent = asCompletion(rawEvent);
    if (!completionEvent) {
        return { position: lastPosition };
    }
    // Anthropic sends the full completion so far with each event whereas OpenAI
    // only sends the delta. To make the SSE events compatible, we remove
    // everything before `lastPosition` from the completion.
    const newEvent = {
        id: "ant-" + (completionEvent.log_id ?? params.fallbackId),
        object: "chat.completion.chunk",
        created: Date.now(),
        model: completionEvent.model ?? params.fallbackModel,
        choices: [
            {
                index: 0,
                delta: { content: completionEvent.completion?.slice(lastPosition) },
                finish_reason: completionEvent.stop_reason,
            },
        ],
    };
    return { position: completionEvent.completion.length, event: newEvent };
};
exports.anthropicV1ToOpenAI = anthropicV1ToOpenAI;
function asCompletion(event) {
    try {
        const parsed = JSON.parse(event.data);
        if (parsed.completion !== undefined && parsed.stop_reason !== undefined) {
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
//# sourceMappingURL=anthropic-v1-to-openai.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openAITextToOpenAIChat = void 0;
const parse_sse_1 = require("../parse-sse");
const logger_1 = require("../../../../../logger");
const log = logger_1.logger.child({
    module: "sse-transformer",
    transformer: "openai-text-to-openai",
});
const openAITextToOpenAIChat = (params) => {
    const { data } = params;
    const rawEvent = (0, parse_sse_1.parseEvent)(data);
    if (!rawEvent.data || rawEvent.data === "[DONE]") {
        return { position: -1 };
    }
    const completionEvent = asCompletion(rawEvent);
    if (!completionEvent) {
        return { position: -1 };
    }
    const newEvent = {
        id: completionEvent.id,
        object: "chat.completion.chunk",
        created: completionEvent.created,
        model: completionEvent.model,
        choices: [
            {
                index: completionEvent.choices[0].index,
                delta: { content: completionEvent.choices[0].text },
                finish_reason: completionEvent.choices[0].finish_reason,
            },
        ],
    };
    return { position: -1, event: newEvent };
};
exports.openAITextToOpenAIChat = openAITextToOpenAIChat;
function asCompletion(event) {
    try {
        const parsed = JSON.parse(event.data);
        if (Array.isArray(parsed.choices) && parsed.choices[0].text !== undefined) {
            return parsed;
        }
        else {
            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Missing required fields");
        }
    }
    catch (error) {
        log.warn({ error: error.stack, event }, "Received invalid data event");
    }
    return null;
}
//# sourceMappingURL=openai-text-to-openai.js.map
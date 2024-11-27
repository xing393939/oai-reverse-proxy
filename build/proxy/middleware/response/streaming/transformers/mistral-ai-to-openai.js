"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mistralAIToOpenAI = void 0;
const logger_1 = require("../../../../../logger");
const parse_sse_1 = require("../parse-sse");
const log = logger_1.logger.child({
    module: "sse-transformer",
    transformer: "mistral-ai-to-openai",
});
const mistralAIToOpenAI = (params) => {
    const { data } = params;
    const rawEvent = (0, parse_sse_1.parseEvent)(data);
    if (!rawEvent.data || rawEvent.data === "[DONE]") {
        return { position: -1 };
    }
    const completionEvent = asCompletion(rawEvent);
    if (!completionEvent) {
        return { position: -1 };
    }
    if ("choices" in completionEvent) {
        const newChatEvent = {
            id: params.fallbackId,
            object: "chat.completion.chunk",
            created: Date.now(),
            model: params.fallbackModel,
            choices: [
                {
                    index: completionEvent.choices[0].index,
                    delta: { content: completionEvent.choices[0].message.content },
                    finish_reason: completionEvent.choices[0].stop_reason,
                },
            ],
        };
        return { position: -1, event: newChatEvent };
    }
    else if ("outputs" in completionEvent) {
        const newTextEvent = {
            id: params.fallbackId,
            object: "chat.completion.chunk",
            created: Date.now(),
            model: params.fallbackModel,
            choices: [
                {
                    index: 0,
                    delta: { content: completionEvent.outputs[0].text },
                    finish_reason: completionEvent.outputs[0].stop_reason,
                },
            ],
        };
        return { position: -1, event: newTextEvent };
    }
    // should never happen
    return { position: -1 };
};
exports.mistralAIToOpenAI = mistralAIToOpenAI;
function asCompletion(event) {
    try {
        const parsed = JSON.parse(event.data);
        if ((Array.isArray(parsed.choices) &&
            parsed.choices[0].message !== undefined) ||
            (Array.isArray(parsed.outputs) && parsed.outputs[0].text !== undefined)) {
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
//# sourceMappingURL=mistral-ai-to-openai.js.map
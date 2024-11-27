"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mistralTextToMistralChat = void 0;
const parse_sse_1 = require("../parse-sse");
const logger_1 = require("../../../../../logger");
const log = logger_1.logger.child({
    module: "sse-transformer",
    transformer: "mistral-text-to-mistral-chat",
});
/**
 * Transforms an incoming Mistral Text SSE to an equivalent Mistral Chat SSE.
 * This is generally used when a client sends a Mistral Chat prompt, but we
 * convert it to Mistral Text before sending it to the API to work around
 * some bugs in Mistral/AWS prompt templating. In these cases we need to convert
 * the response back to Mistral Chat.
 */
const mistralTextToMistralChat = (params) => {
    const { data } = params;
    const rawEvent = (0, parse_sse_1.parseEvent)(data);
    if (!rawEvent.data) {
        return { position: -1 };
    }
    const textCompletion = asTextCompletion(rawEvent);
    if (!textCompletion) {
        return { position: -1 };
    }
    const chatEvent = {
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: textCompletion.outputs[0].text },
                stop_reason: textCompletion.outputs[0].stop_reason,
            },
        ],
    };
    return { position: -1, event: chatEvent };
};
exports.mistralTextToMistralChat = mistralTextToMistralChat;
function asTextCompletion(event) {
    try {
        const parsed = JSON.parse(event.data);
        if (Array.isArray(parsed.outputs) && parsed.outputs[0].text !== undefined) {
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
//# sourceMappingURL=mistral-text-to-mistral-chat.js.map
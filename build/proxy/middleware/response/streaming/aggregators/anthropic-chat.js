"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeEventsForAnthropicChat = void 0;
/**
 * Given a list of OpenAI chat completion events, compiles them into a single
 * finalized Anthropic chat completion response so that non-streaming middleware
 * can operate on it as if it were a blocking response.
 */
function mergeEventsForAnthropicChat(events) {
    let merged = {
        id: "",
        type: "message",
        role: "assistant",
        content: [],
        model: "",
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
    };
    merged = events.reduce((acc, event, i) => {
        // The first event will only contain role assignment and response metadata
        if (i === 0) {
            acc.id = event.id;
            acc.model = event.model;
            acc.content = [{ type: "text", text: "" }];
            return acc;
        }
        acc.stop_reason = event.choices[0].finish_reason ?? "";
        if (event.choices[0].delta.content) {
            acc.content[0].text += event.choices[0].delta.content;
        }
        return acc;
    }, merged);
    return merged;
}
exports.mergeEventsForAnthropicChat = mergeEventsForAnthropicChat;
//# sourceMappingURL=anthropic-chat.js.map
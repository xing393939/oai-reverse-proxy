"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeEventsForAnthropicText = void 0;
/**
 * Given a list of OpenAI chat completion events, compiles them into a single
 * finalized Anthropic completion response so that non-streaming middleware
 * can operate on it as if it were a blocking response.
 */
function mergeEventsForAnthropicText(events) {
    let merged = {
        log_id: "",
        exception: null,
        model: "",
        completion: "",
        stop_reason: "",
        truncated: false,
        stop: null,
    };
    merged = events.reduce((acc, event, i) => {
        // The first event will only contain role assignment and response metadata
        if (i === 0) {
            acc.log_id = event.id;
            acc.model = event.model;
            acc.completion = "";
            acc.stop_reason = "";
            return acc;
        }
        acc.stop_reason = event.choices[0].finish_reason ?? "";
        if (event.choices[0].delta.content) {
            acc.completion += event.choices[0].delta.content;
        }
        return acc;
    }, merged);
    return merged;
}
exports.mergeEventsForAnthropicText = mergeEventsForAnthropicText;
//# sourceMappingURL=anthropic-text.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeEventsForMistralText = void 0;
/**
 * Given a list of OpenAI chat completion events, compiles them into a single
 * finalized Mistral text completion response so that non-streaming middleware
 * can operate on it as if it were a blocking response.
 */
function mergeEventsForMistralText(events) {
    let merged = {
        outputs: [{ text: "", stop_reason: "" }],
    };
    merged = events.reduce((acc, event, i) => {
        // The first event will only contain role assignment and response metadata
        if (i === 0) {
            return acc;
        }
        acc.outputs[0].text += event.choices[0].delta.content ?? "";
        acc.outputs[0].stop_reason = event.choices[0].finish_reason ?? "";
        return acc;
    }, merged);
    return merged;
}
exports.mergeEventsForMistralText = mergeEventsForMistralText;
//# sourceMappingURL=mistral-text.js.map
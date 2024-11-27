"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passthroughToOpenAI = void 0;
const parse_sse_1 = require("../parse-sse");
const logger_1 = require("../../../../../logger");
const log = logger_1.logger.child({
    module: "sse-transformer",
    transformer: "openai-to-openai",
});
const passthroughToOpenAI = (params) => {
    const { data } = params;
    const rawEvent = (0, parse_sse_1.parseEvent)(data);
    if (!rawEvent.data || rawEvent.data === "[DONE]") {
        return { position: -1 };
    }
    const completionEvent = asCompletion(rawEvent);
    if (!completionEvent) {
        return { position: -1 };
    }
    return { position: -1, event: completionEvent };
};
exports.passthroughToOpenAI = passthroughToOpenAI;
function asCompletion(event) {
    try {
        return JSON.parse(event.data);
    }
    catch (error) {
        log.warn({ error: error.stack, event }, "Received invalid event");
    }
    return null;
}
//# sourceMappingURL=passthrough-to-openai.js.map
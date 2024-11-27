"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asAnthropicChatDelta = exports.anthropicChatToAnthropicV2 = void 0;
const parse_sse_1 = require("../parse-sse");
const logger_1 = require("../../../../../logger");
const log = logger_1.logger.child({
    module: "sse-transformer",
    transformer: "anthropic-chat-to-anthropic-v2",
});
/**
 * Transforms an incoming Anthropic Chat SSE to an equivalent Anthropic V2
 * Text SSE.
 * For now we assume there is only one content block and message delta. In the
 * future Anthropic may add multi-turn responses or multiple content blocks
 * (probably for multimodal responses, image generation, etc) but as far as I
 * can tell this is not yet implemented.
 */
const anthropicChatToAnthropicV2 = (params) => {
    const { data } = params;
    const rawEvent = (0, parse_sse_1.parseEvent)(data);
    if (!rawEvent.data || !rawEvent.type) {
        return { position: -1 };
    }
    const deltaEvent = asAnthropicChatDelta(rawEvent);
    if (!deltaEvent) {
        return { position: -1 };
    }
    const newEvent = {
        log_id: params.fallbackId,
        model: params.fallbackModel,
        completion: deltaEvent.delta.text,
        stop_reason: null,
    };
    return { position: -1, event: newEvent };
};
exports.anthropicChatToAnthropicV2 = anthropicChatToAnthropicV2;
function asAnthropicChatDelta(event) {
    if (!event.type ||
        !["content_block_start", "content_block_delta"].includes(event.type)) {
        return null;
    }
    try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "content_block_delta") {
            return parsed;
        }
        else if (parsed.type === "content_block_start") {
            return {
                type: "content_block_delta",
                index: parsed.index,
                delta: { type: "text_delta", text: parsed.content_block?.text ?? "" },
            };
        }
        else {
            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Invalid event type");
        }
    }
    catch (error) {
        log.warn({ error: error.stack, event }, "Received invalid event");
    }
    return null;
}
exports.asAnthropicChatDelta = asAnthropicChatDelta;
//# sourceMappingURL=anthropic-chat-to-anthropic-v2.js.map
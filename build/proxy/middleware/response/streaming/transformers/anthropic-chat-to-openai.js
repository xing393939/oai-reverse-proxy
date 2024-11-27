"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropicChatToOpenAI = void 0;
const parse_sse_1 = require("../parse-sse");
const logger_1 = require("../../../../../logger");
const anthropic_chat_to_anthropic_v2_1 = require("./anthropic-chat-to-anthropic-v2");
const log = logger_1.logger.child({
    module: "sse-transformer",
    transformer: "anthropic-chat-to-openai",
});
/**
 * Transforms an incoming Anthropic Chat SSE to an equivalent OpenAI
 * chat.completion.chunks SSE.
 */
const anthropicChatToOpenAI = (params) => {
    const { data } = params;
    const rawEvent = (0, parse_sse_1.parseEvent)(data);
    if (!rawEvent.data || !rawEvent.type) {
        return { position: -1 };
    }
    const deltaEvent = (0, anthropic_chat_to_anthropic_v2_1.asAnthropicChatDelta)(rawEvent);
    if (!deltaEvent) {
        return { position: -1 };
    }
    const newEvent = {
        id: params.fallbackId,
        object: "chat.completion.chunk",
        created: Date.now(),
        model: params.fallbackModel,
        choices: [
            {
                index: 0,
                delta: { content: deltaEvent.delta.text },
                finish_reason: null,
            },
        ],
    };
    return { position: -1, event: newEvent };
};
exports.anthropicChatToOpenAI = anthropicChatToOpenAI;
//# sourceMappingURL=anthropic-chat-to-openai.js.map
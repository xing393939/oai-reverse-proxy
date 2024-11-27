"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSEMessageTransformer = void 0;
const stream_1 = require("stream");
const utils_1 = require("../../../../shared/utils");
const index_1 = require("./index");
/**
 * Transforms SSE messages from one API format to OpenAI chat.completion.chunks.
 * Emits the original string SSE message as an "originalMessage" event.
 */
class SSEMessageTransformer extends stream_1.Transform {
    lastPosition;
    transformState;
    msgCount;
    inputFormat;
    transformFn;
    log;
    fallbackId;
    fallbackModel;
    constructor(options) {
        super({ ...options, readableObjectMode: true });
        this.log = options.logger?.child({ module: "sse-transformer" });
        this.lastPosition = 0;
        this.msgCount = 0;
        this.transformFn = getTransformer(options.inputFormat, options.inputApiVersion, options.outputFormat);
        this.inputFormat = options.inputFormat;
        this.fallbackId = options.requestId;
        this.fallbackModel = options.requestedModel;
        this.log.debug({
            fn: this.transformFn.name,
            format: options.inputFormat,
            version: options.inputApiVersion,
        }, "Selected SSE transformer");
    }
    _transform(chunk, _encoding, callback) {
        try {
            const originalMessage = chunk.toString();
            const { event: transformedMessage, position: newPosition, state, } = this.transformFn({
                data: originalMessage,
                lastPosition: this.lastPosition,
                index: this.msgCount++,
                fallbackId: this.fallbackId,
                fallbackModel: this.fallbackModel,
                state: this.transformState,
            });
            this.lastPosition = newPosition;
            this.transformState = state;
            // Special case for Azure OpenAI, which is 99% the same as OpenAI but
            // sometimes emits an extra event at the beginning of the stream with the
            // content moderation system's response to the prompt. A lot of frontends
            // don't expect this and neither does our event aggregator so we drop it.
            if (this.inputFormat === "openai" && this.msgCount <= 1) {
                if (originalMessage.includes("prompt_filter_results")) {
                    this.log.debug("Dropping Azure OpenAI content moderation SSE event");
                    return callback();
                }
            }
            this.emit("originalMessage", originalMessage);
            // Some events may not be transformed, e.g. ping events
            if (!transformedMessage)
                return callback();
            if (this.msgCount === 1 && eventIsOpenAIEvent(transformedMessage)) {
                // TODO: does this need to be skipped for passthroughToOpenAI?
                this.push(createInitialMessage(transformedMessage));
            }
            this.push(transformedMessage);
            callback();
        }
        catch (err) {
            err.lastEvent = chunk?.toString();
            this.log.error(err, "Error transforming SSE message");
            callback(err);
        }
    }
}
exports.SSEMessageTransformer = SSEMessageTransformer;
function eventIsOpenAIEvent(event) {
    return event?.object === "chat.completion.chunk";
}
function getTransformer(responseApi, version, 
// In most cases, we are transforming back to OpenAI. Some responses can be
// translated between two non-OpenAI formats, eg Anthropic Chat -> Anthropic
// Text, or Mistral Text -> Mistral Chat.
requestApi = "openai") {
    switch (responseApi) {
        case "openai":
            return index_1.passthroughToOpenAI;
        case "openai-text":
            return index_1.openAITextToOpenAIChat;
        case "anthropic-text":
            return version === "2023-01-01"
                ? index_1.anthropicV1ToOpenAI
                : index_1.anthropicV2ToOpenAI;
        case "anthropic-chat":
            return requestApi === "anthropic-text"
                ? index_1.anthropicChatToAnthropicV2 // User's legacy text prompt was converted to chat, and response must be converted back to text
                : index_1.anthropicChatToOpenAI;
        case "google-ai":
            return index_1.googleAIToOpenAI;
        case "mistral-ai":
            return index_1.mistralAIToOpenAI;
        case "mistral-text":
            return requestApi === "mistral-ai"
                ? index_1.mistralTextToMistralChat // User's chat request was converted to text, and response must be converted back to chat
                : index_1.mistralAIToOpenAI;
        case "openai-image":
            throw new Error(`SSE transformation not supported for ${responseApi}`);
        default:
            (0, utils_1.assertNever)(responseApi);
    }
}
/**
 * OpenAI streaming chat completions start with an event that contains only the
 * metadata and role (always 'assistant') for the response.  To simulate this
 * for APIs where the first event contains actual content, we create a fake
 * initial event with no content but correct metadata.
 */
function createInitialMessage(event) {
    return {
        ...event,
        choices: event.choices.map((choice) => ({
            ...choice,
            delta: { role: "assistant", content: "" },
        })),
    };
}
//# sourceMappingURL=sse-message-transformer.js.map
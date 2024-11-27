"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventAggregator = void 0;
const utils_1 = require("../../../../shared/utils");
const index_1 = require("./index");
/**
 * Collects SSE events containing incremental chat completion responses and
 * compiles them into a single finalized response for downstream middleware.
 */
class EventAggregator {
    model;
    requestFormat;
    responseFormat;
    events;
    constructor({ body, inboundApi, outboundApi }) {
        this.events = [];
        this.requestFormat = inboundApi;
        this.responseFormat = outboundApi;
        this.model = body.model;
    }
    addEvent(event) {
        if (eventIsOpenAIEvent(event)) {
            this.events.push(event);
        }
        else {
            // horrible special case. previously all transformers' target format was
            // openai, so the event aggregator could conveniently assume all incoming
            // events were in openai format.
            // now we have added some transformers that convert between non-openai
            // formats, so aggregator needs to know how to collapse for more than
            // just openai.
            // because writing aggregation logic for every possible output format is
            // annoying, we will just transform any non-openai output events to openai
            // format (even if the client did not request openai at all) so that we
            // still only need to write aggregators for openai SSEs.
            let openAIEvent;
            switch (this.requestFormat) {
                case "anthropic-text":
                    assertIsAnthropicV2Event(event);
                    openAIEvent = (0, index_1.anthropicV2ToOpenAI)({
                        data: `event: completion\ndata: ${JSON.stringify(event)}\n\n`,
                        lastPosition: -1,
                        index: 0,
                        fallbackId: event.log_id || "fallback-" + Date.now(),
                        fallbackModel: event.model || this.model || "fallback-claude-3",
                    })?.event;
                    break;
                case "mistral-ai":
                    assertIsMistralChatEvent(event);
                    openAIEvent = (0, index_1.mistralAIToOpenAI)({
                        data: `data: ${JSON.stringify(event)}\n\n`,
                        lastPosition: -1,
                        index: 0,
                        fallbackId: "fallback-" + Date.now(),
                        fallbackModel: this.model || "fallback-mistral",
                    })?.event;
                    break;
            }
            if (openAIEvent) {
                this.events.push(openAIEvent);
            }
        }
    }
    getFinalResponse() {
        switch (this.responseFormat) {
            case "openai":
            case "google-ai": // TODO: this is probably wrong now that we support native Google Makersuite prompts
                return (0, index_1.mergeEventsForOpenAIChat)(this.events);
            case "openai-text":
                return (0, index_1.mergeEventsForOpenAIText)(this.events);
            case "anthropic-text":
                return (0, index_1.mergeEventsForAnthropicText)(this.events);
            case "anthropic-chat":
                return (0, index_1.mergeEventsForAnthropicChat)(this.events);
            case "mistral-ai":
                return (0, index_1.mergeEventsForMistralChat)(this.events);
            case "mistral-text":
                return (0, index_1.mergeEventsForMistralText)(this.events);
            case "openai-image":
                throw new Error(`SSE aggregation not supported for ${this.responseFormat}`);
            default:
                (0, utils_1.assertNever)(this.responseFormat);
        }
    }
    hasEvents() {
        return this.events.length > 0;
    }
}
exports.EventAggregator = EventAggregator;
function eventIsOpenAIEvent(event) {
    return event?.object === "chat.completion.chunk";
}
function assertIsAnthropicV2Event(event) {
    if (!event?.completion) {
        throw new Error(`Bad event for Anthropic V2 SSE aggregation`);
    }
}
function assertIsMistralChatEvent(event) {
    if (!event?.choices) {
        throw new Error(`Bad event for Mistral SSE aggregation`);
    }
}
//# sourceMappingURL=event-aggregator.js.map
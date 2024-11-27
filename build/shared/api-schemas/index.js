"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_REQUEST_VALIDATORS = exports.API_REQUEST_TRANSFORMERS = exports.flattenAnthropicMessages = exports.AnthropicV1MessagesSchema = exports.AnthropicV1TextSchema = void 0;
const anthropic_1 = require("./anthropic");
const openai_1 = require("./openai");
const openai_text_1 = require("./openai-text");
const openai_image_1 = require("./openai-image");
const google_ai_1 = require("./google-ai");
const mistral_ai_1 = require("./mistral-ai");
var anthropic_2 = require("./anthropic");
Object.defineProperty(exports, "AnthropicV1TextSchema", { enumerable: true, get: function () { return anthropic_2.AnthropicV1TextSchema; } });
Object.defineProperty(exports, "AnthropicV1MessagesSchema", { enumerable: true, get: function () { return anthropic_2.AnthropicV1MessagesSchema; } });
Object.defineProperty(exports, "flattenAnthropicMessages", { enumerable: true, get: function () { return anthropic_2.flattenAnthropicMessages; } });
exports.API_REQUEST_TRANSFORMERS = {
    "anthropic-text->anthropic-chat": anthropic_1.transformAnthropicTextToAnthropicChat,
    "openai->anthropic-chat": anthropic_1.transformOpenAIToAnthropicChat,
    "openai->anthropic-text": anthropic_1.transformOpenAIToAnthropicText,
    "openai->openai-text": openai_text_1.transformOpenAIToOpenAIText,
    "openai->openai-image": openai_image_1.transformOpenAIToOpenAIImage,
    "openai->google-ai": google_ai_1.transformOpenAIToGoogleAI,
    "mistral-ai->mistral-text": mistral_ai_1.transformMistralChatToText,
};
exports.API_REQUEST_VALIDATORS = {
    "anthropic-chat": anthropic_1.AnthropicV1MessagesSchema,
    "anthropic-text": anthropic_1.AnthropicV1TextSchema,
    openai: openai_1.OpenAIV1ChatCompletionSchema,
    "openai-text": openai_text_1.OpenAIV1TextCompletionSchema,
    "openai-image": openai_image_1.OpenAIV1ImagesGenerationSchema,
    "google-ai": google_ai_1.GoogleAIV1GenerateContentSchema,
    "mistral-ai": mistral_ai_1.MistralAIV1ChatCompletionsSchema,
    "mistral-text": mistral_ai_1.MistralAIV1TextCompletionsSchema,
};
//# sourceMappingURL=index.js.map
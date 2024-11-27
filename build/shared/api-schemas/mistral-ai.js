"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformMistralChatToText = exports.fixMistralPrompt = exports.AWSMistralV1TextCompletionsSchema = exports.AWSMistralV1ChatCompletionsSchema = exports.MistralAIV1TextCompletionsSchema = exports.MistralAIV1ChatCompletionsSchema = void 0;
const zod_1 = require("zod");
const openai_1 = require("./openai");
const jinja_1 = require("@huggingface/jinja");
const logger_1 = require("../../logger");
const MistralChatMessageSchema = zod_1.z.object({
    role: zod_1.z.enum(["system", "user", "assistant", "tool"]), // TODO: implement tools
    content: zod_1.z.string(),
    prefix: zod_1.z.boolean().optional(),
});
const MistralMessagesSchema = zod_1.z.array(MistralChatMessageSchema).refine((input) => {
    const prefixIdx = input.findIndex((msg) => Boolean(msg.prefix));
    if (prefixIdx === -1)
        return true; // no prefix messages
    const lastIdx = input.length - 1;
    const lastMsg = input[lastIdx];
    return prefixIdx === lastIdx && lastMsg.role === "assistant";
}, {
    message: "`prefix` can only be set to `true` on the last message, and only for an assistant message.",
});
// https://docs.mistral.ai/api#operation/createChatCompletion
const BaseMistralAIV1CompletionsSchema = zod_1.z.object({
    model: zod_1.z.string(),
    messages: MistralMessagesSchema.optional(),
    prompt: zod_1.z.string().optional(),
    temperature: zod_1.z.number().optional().default(0.7),
    top_p: zod_1.z.number().optional().default(1),
    max_tokens: zod_1.z.coerce
        .number()
        .int()
        .nullish()
        .transform((v) => Math.min(v ?? openai_1.OPENAI_OUTPUT_MAX, openai_1.OPENAI_OUTPUT_MAX)),
    stream: zod_1.z.boolean().optional().default(false),
    // Mistral docs say that `stop` can be a string or array but AWS Mistral
    // blows up if a string is passed. We must convert it to an array.
    stop: zod_1.z
        .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())])
        .optional()
        .default([])
        .transform((v) => (Array.isArray(v) ? v : [v])),
    random_seed: zod_1.z.number().int().min(0).optional(),
    response_format: zod_1.z
        .object({ type: zod_1.z.enum(["text", "json_object"]) })
        .optional(),
    safe_prompt: zod_1.z.boolean().optional().default(false),
});
exports.MistralAIV1ChatCompletionsSchema = BaseMistralAIV1CompletionsSchema.and(zod_1.z.object({ messages: MistralMessagesSchema }));
exports.MistralAIV1TextCompletionsSchema = BaseMistralAIV1CompletionsSchema.and(zod_1.z.object({ prompt: zod_1.z.string() }));
/*
  Slightly more strict version that only allows a subset of the parameters. AWS
  Mistral helpfully returns no details if unsupported parameters are passed so
  this list comes from trial and error as of 2024-08-12.
*/
const BaseAWSMistralAIV1CompletionsSchema = BaseMistralAIV1CompletionsSchema.pick({
    temperature: true,
    top_p: true,
    max_tokens: true,
    stop: true,
    random_seed: true,
    // response_format: true,
    // safe_prompt: true,
}).strip();
exports.AWSMistralV1ChatCompletionsSchema = BaseAWSMistralAIV1CompletionsSchema.and(zod_1.z.object({ messages: MistralMessagesSchema }));
exports.AWSMistralV1TextCompletionsSchema = BaseAWSMistralAIV1CompletionsSchema.and(zod_1.z.object({ prompt: zod_1.z.string() }));
function fixMistralPrompt(messages) {
    // Mistral uses OpenAI format but has some additional requirements:
    // - Only one system message per request, and it must be the first message if
    //   present.
    // - Final message must be a user message, unless it has `prefix: true`.
    // - Cannot have multiple messages from the same role in a row.
    // While frontends should be able to handle this, we can fix it here in the
    // meantime.
    const fixed = messages.reduce((acc, msg) => {
        if (acc.length === 0) {
            acc.push(msg);
            return acc;
        }
        const copy = { ...msg };
        // Reattribute subsequent system messages to the user
        if (msg.role === "system") {
            copy.role = "user";
        }
        // Consolidate multiple messages from the same role
        const last = acc[acc.length - 1];
        if (last.role === copy.role) {
            last.content += "\n\n" + copy.content;
        }
        else {
            acc.push(copy);
        }
        return acc;
    }, []);
    // If the last message is an assistant message, mark it as a prefix. An
    // assistant message at the end of the conversation without `prefix: true`
    // results in an error.
    if (fixed[fixed.length - 1].role === "assistant") {
        fixed[fixed.length - 1].prefix = true;
    }
    return fixed;
}
exports.fixMistralPrompt = fixMistralPrompt;
let jinjaTemplate;
let renderTemplate;
function renderMistralPrompt(messages) {
    if (!jinjaTemplate) {
        logger_1.logger.warn("Lazy loading mistral chat template...");
        const { chatTemplate, bosToken, eosToken } = require("./templates/mistral-template").MISTRAL_TEMPLATE;
        jinjaTemplate = new jinja_1.Template(chatTemplate);
        renderTemplate = (messages) => jinjaTemplate.render({
            messages,
            bos_token: bosToken,
            eos_token: eosToken,
        });
    }
    return renderTemplate(messages);
}
/**
 * Attempts to convert a Mistral chat completions request to a text completions,
 * using the official prompt template published by Mistral.
 */
const transformMistralChatToText = async (req) => {
    const { body } = req;
    const result = exports.MistralAIV1ChatCompletionsSchema.safeParse(body);
    if (!result.success) {
        req.log.warn({ issues: result.error.issues, body }, "Invalid Mistral chat completions request");
        throw result.error;
    }
    const { messages, ...rest } = result.data;
    const prompt = renderMistralPrompt(messages);
    return { ...rest, prompt, messages: undefined };
};
exports.transformMistralChatToText = transformMistralChatToText;
//# sourceMappingURL=mistral-ai.js.map
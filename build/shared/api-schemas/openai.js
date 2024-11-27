"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.containsImageContent = exports.flattenOpenAIChatMessages = exports.flattenOpenAIMessageContent = exports.OpenAIV1ChatCompletionSchema = exports.OPENAI_OUTPUT_MAX = void 0;
const zod_1 = require("zod");
const config_1 = require("../../config");
exports.OPENAI_OUTPUT_MAX = config_1.config.maxOutputTokensOpenAI;
// https://platform.openai.com/docs/api-reference/chat/create
const OpenAIV1ChatContentArraySchema = zod_1.z.array(zod_1.z.union([
    zod_1.z.object({ type: zod_1.z.literal("text"), text: zod_1.z.string() }),
    zod_1.z.object({
        type: zod_1.z.union([zod_1.z.literal("image"), zod_1.z.literal("image_url")]),
        image_url: zod_1.z.object({
            url: zod_1.z.string().url(),
            detail: zod_1.z.enum(["low", "auto", "high"]).optional().default("auto"),
        }),
    }),
]));
exports.OpenAIV1ChatCompletionSchema = zod_1.z
    .object({
    model: zod_1.z.string().max(100),
    messages: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.enum(["system", "user", "assistant", "tool", "function"]),
        content: zod_1.z.union([zod_1.z.string(), OpenAIV1ChatContentArraySchema]),
        name: zod_1.z.string().optional(),
        tool_calls: zod_1.z.array(zod_1.z.any()).optional(),
        function_call: zod_1.z.array(zod_1.z.any()).optional(),
        tool_call_id: zod_1.z.string().optional(),
    }), {
        required_error: "No `messages` found. Ensure you've set the correct completion endpoint.",
        invalid_type_error: "Messages were not formatted correctly. Refer to the OpenAI Chat API documentation for more information.",
    }),
    temperature: zod_1.z.number().optional().default(1),
    top_p: zod_1.z.number().optional().default(1),
    n: zod_1.z
        .literal(1, {
        errorMap: () => ({
            message: "You may only request a single completion at a time.",
        }),
    })
        .optional(),
    stream: zod_1.z.boolean().optional().default(false),
    stop: zod_1.z
        .union([zod_1.z.string().max(500), zod_1.z.array(zod_1.z.string().max(500))])
        .nullish(),
    max_tokens: zod_1.z.coerce
        .number()
        .int()
        .nullish()
        .default(Math.min(exports.OPENAI_OUTPUT_MAX, 16384))
        .transform((v) => Math.min(v ?? exports.OPENAI_OUTPUT_MAX, exports.OPENAI_OUTPUT_MAX)),
    // max_completion_tokens replaces max_tokens in the OpenAI API.
    // for backwards compatibility, we accept both and move the value in
    // max_tokens to max_completion_tokens in proxy middleware.
    max_completion_tokens: zod_1.z.coerce
        .number()
        .int()
        .optional(),
    frequency_penalty: zod_1.z.number().optional().default(0),
    presence_penalty: zod_1.z.number().optional().default(0),
    logit_bias: zod_1.z.any().optional(),
    user: zod_1.z.string().max(500).optional(),
    seed: zod_1.z.number().int().optional(),
    // Be warned that Azure OpenAI combines these two into a single field.
    // It's the only deviation from the OpenAI API that I'm aware of so I have
    // special cased it in `addAzureKey` rather than expecting clients to do it.
    logprobs: zod_1.z.boolean().optional(),
    top_logprobs: zod_1.z.number().int().optional(),
    // Quickly adding some newer tool usage params, not tested. They will be
    // passed through to the API as-is.
    tools: zod_1.z.array(zod_1.z.any()).optional(),
    functions: zod_1.z.array(zod_1.z.any()).optional(),
    tool_choice: zod_1.z.any().optional(),
    function_choice: zod_1.z.any().optional(),
    response_format: zod_1.z.any(),
})
    // Tool usage must be enabled via config because we currently have no way to
    // track quota usage for them or enforce limits.
    .omit(Boolean(config_1.config.allowOpenAIToolUsage) ? {} : { tools: true, functions: true })
    .strip();
function flattenOpenAIMessageContent(content) {
    return Array.isArray(content)
        ? content
            .map((contentItem) => {
            if ("text" in contentItem)
                return contentItem.text;
            if ("image_url" in contentItem)
                return "[ Uploaded Image Omitted ]";
        })
            .join("\n")
        : content;
}
exports.flattenOpenAIMessageContent = flattenOpenAIMessageContent;
function flattenOpenAIChatMessages(messages) {
    // Temporary to allow experimenting with prompt strategies
    const PROMPT_VERSION = 1;
    switch (PROMPT_VERSION) {
        case 1:
            return (messages
                .map((m) => {
                // Claude-style human/assistant turns
                let role = m.role;
                if (role === "assistant") {
                    role = "Assistant";
                }
                else if (role === "system") {
                    role = "System";
                }
                else if (role === "user") {
                    role = "User";
                }
                return `\n\n${role}: ${flattenOpenAIMessageContent(m.content)}`;
            })
                .join("") + "\n\nAssistant:");
        case 2:
            return messages
                .map((m) => {
                // Claude without prefixes (except system) and no Assistant priming
                let role = "";
                if (role === "system") {
                    role = "System: ";
                }
                return `\n\n${role}${flattenOpenAIMessageContent(m.content)}`;
            })
                .join("");
        default:
            throw new Error(`Unknown prompt version: ${PROMPT_VERSION}`);
    }
}
exports.flattenOpenAIChatMessages = flattenOpenAIChatMessages;
function containsImageContent(messages) {
    return messages.some((m) => Array.isArray(m.content)
        ? m.content.some((contentItem) => "image_url" in contentItem)
        : false);
}
exports.containsImageContent = containsImageContent;
//# sourceMappingURL=openai.js.map
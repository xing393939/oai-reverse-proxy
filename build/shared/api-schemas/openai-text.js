"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformOpenAIToOpenAIText = exports.OpenAIV1TextCompletionSchema = void 0;
const zod_1 = require("zod");
const openai_1 = require("./openai");
exports.OpenAIV1TextCompletionSchema = zod_1.z
    .object({
    model: zod_1.z
        .string()
        .max(100)
        .regex(/^gpt-3.5-turbo-instruct/, "Model must start with 'gpt-3.5-turbo-instruct'"),
    prompt: zod_1.z.string({
        required_error: "No `prompt` found. Ensure you've set the correct completion endpoint.",
    }),
    logprobs: zod_1.z.number().int().nullish().default(null),
    echo: zod_1.z.boolean().optional().default(false),
    best_of: zod_1.z.literal(1).optional(),
    stop: zod_1.z
        .union([zod_1.z.string().max(500), zod_1.z.array(zod_1.z.string().max(500)).max(4)])
        .optional(),
    suffix: zod_1.z.string().max(1000).optional(),
})
    .strip()
    .merge(openai_1.OpenAIV1ChatCompletionSchema.omit({ messages: true, logprobs: true }));
const transformOpenAIToOpenAIText = async (req) => {
    const { body } = req;
    const result = openai_1.OpenAIV1ChatCompletionSchema.safeParse(body);
    if (!result.success) {
        req.log.warn({ issues: result.error.issues, body }, "Invalid OpenAI-to-OpenAI-text request");
        throw result.error;
    }
    const { messages, ...rest } = result.data;
    const prompt = (0, openai_1.flattenOpenAIChatMessages)(messages);
    let stops = rest.stop
        ? Array.isArray(rest.stop)
            ? rest.stop
            : [rest.stop]
        : [];
    stops.push("\n\nUser:");
    stops = [...new Set(stops)];
    const transformed = { ...rest, prompt: prompt, stop: stops };
    return exports.OpenAIV1TextCompletionSchema.parse(transformed);
};
exports.transformOpenAIToOpenAIText = transformOpenAIToOpenAIText;
//# sourceMappingURL=openai-text.js.map
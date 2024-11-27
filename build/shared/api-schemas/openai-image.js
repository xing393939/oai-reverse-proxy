"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformOpenAIToOpenAIImage = exports.OpenAIV1ImagesGenerationSchema = void 0;
const zod_1 = require("zod");
const openai_1 = require("./openai");
// https://platform.openai.com/docs/api-reference/images/create
exports.OpenAIV1ImagesGenerationSchema = zod_1.z
    .object({
    prompt: zod_1.z.string().max(4000),
    model: zod_1.z.string().max(100).optional(),
    quality: zod_1.z.enum(["standard", "hd"]).optional().default("standard"),
    n: zod_1.z.number().int().min(1).max(4).optional().default(1),
    response_format: zod_1.z.enum(["url", "b64_json"]).optional(),
    size: zod_1.z
        .enum(["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"])
        .optional()
        .default("1024x1024"),
    style: zod_1.z.enum(["vivid", "natural"]).optional().default("vivid"),
    user: zod_1.z.string().max(500).optional(),
})
    .strip();
// Takes the last chat message and uses it verbatim as the image prompt.
const transformOpenAIToOpenAIImage = async (req) => {
    const { body } = req;
    const result = openai_1.OpenAIV1ChatCompletionSchema.safeParse(body);
    if (!result.success) {
        req.log.warn({ issues: result.error.issues, body }, "Invalid OpenAI-to-OpenAI-image request");
        throw result.error;
    }
    const { messages } = result.data;
    const prompt = messages.filter((m) => m.role === "user").pop()?.content;
    if (Array.isArray(prompt)) {
        throw new Error("Image generation prompt must be a text message.");
    }
    if (body.stream) {
        throw new Error("Streaming is not supported for image generation requests.");
    }
    // Some frontends do weird things with the prompt, like prefixing it with a
    // character name or wrapping the entire thing in quotes. We will look for
    // the index of "Image:" and use everything after that as the prompt.
    const index = prompt?.toLowerCase().indexOf("image:");
    if (index === -1 || !prompt) {
        throw new Error(`Start your prompt with 'Image:' followed by a description of the image you want to generate (received: ${prompt}).`);
    }
    // TODO: Add some way to specify parameters via chat message
    const transformed = {
        model: body.model.includes("dall-e") ? body.model : "dall-e-3",
        quality: "standard",
        size: "1024x1024",
        response_format: "url",
        prompt: prompt.slice(index + 6).trim(),
    };
    return exports.OpenAIV1ImagesGenerationSchema.parse(transformed);
};
exports.transformOpenAIToOpenAIImage = transformOpenAIToOpenAIImage;
//# sourceMappingURL=openai-image.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformOpenAIToGoogleAI = exports.GoogleAIV1GenerateContentSchema = void 0;
const zod_1 = require("zod");
const openai_1 = require("./openai");
const GoogleAIV1ContentSchema = zod_1.z.object({
    parts: zod_1.z
        .union([
        zod_1.z.array(zod_1.z.object({ text: zod_1.z.string() })),
        zod_1.z.object({ text: zod_1.z.string() }),
    ])
        // Google allows parts to be an array or a single object, which is really
        // annoying for downstream code. We will coerce it to an array here.
        .transform((val) => (Array.isArray(val) ? val : [val])),
    // TODO: add other media types
    role: zod_1.z.enum(["user", "model"]).optional(),
});
const SafetySettingsSchema = zod_1.z
    .array(zod_1.z.object({
    category: zod_1.z.enum([
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
        "HARM_CATEGORY_CIVIC_INTEGRITY",
    ]),
    threshold: zod_1.z.enum([
        "OFF",
        "BLOCK_NONE",
        "BLOCK_ONLY_HIGH",
        "BLOCK_MEDIUM_AND_ABOVE",
        "BLOCK_LOW_AND_ABOVE",
        "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
    ]),
}))
    .optional();
// https://developers.generativeai.google/api/rest/generativelanguage/models/generateContent
exports.GoogleAIV1GenerateContentSchema = zod_1.z
    .object({
    model: zod_1.z.string().max(100), //actually specified in path but we need it for the router
    stream: zod_1.z.boolean().optional().default(false), // also used for router
    contents: zod_1.z.array(GoogleAIV1ContentSchema),
    tools: zod_1.z.array(zod_1.z.object({})).max(0).optional(),
    safetySettings: SafetySettingsSchema,
    systemInstruction: GoogleAIV1ContentSchema.optional(),
    // quick fix for SillyTavern, which uses camel case field names for everything
    // except for system_instruction where it randomly uses snake case.
    // google api evidently accepts either case.
    system_instruction: GoogleAIV1ContentSchema.optional(),
    generationConfig: zod_1.z
        .object({
        temperature: zod_1.z.number().min(0).max(2).optional(),
        maxOutputTokens: zod_1.z.coerce
            .number()
            .int()
            .optional()
            .default(16)
            .transform((v) => Math.min(v, 4096)), // TODO: Add config
        candidateCount: zod_1.z.literal(1).optional(),
        topP: zod_1.z.number().min(0).max(1).optional(),
        topK: zod_1.z.number().min(1).max(40).optional(),
        stopSequences: zod_1.z.array(zod_1.z.string().max(500)).max(5).optional(),
    })
        .default({}),
})
    .strip();
const transformOpenAIToGoogleAI = async (req) => {
    const { body } = req;
    const result = openai_1.OpenAIV1ChatCompletionSchema.safeParse({
        ...body,
        model: "gpt-3.5-turbo",
    });
    if (!result.success) {
        req.log.warn({ issues: result.error.issues, body }, "Invalid OpenAI-to-Google AI request");
        throw result.error;
    }
    const { messages, ...rest } = result.data;
    const foundNames = new Set();
    const contents = messages
        .map((m) => {
        const role = m.role === "assistant" ? "model" : "user";
        // Detects character names so we can set stop sequences for them as Gemini
        // is prone to continuing as the next character.
        // If names are not available, we'll still try to prefix the message
        // with generic names so we can set stops for them but they don't work
        // as well as real names.
        const text = (0, openai_1.flattenOpenAIMessageContent)(m.content);
        const propName = m.name?.trim();
        const textName = m.role === "system" ? "" : text.match(/^(.{0,50}?): /)?.[1]?.trim();
        const name = propName || textName || (role === "model" ? "Character" : "User");
        foundNames.add(name);
        // Prefixing messages with their character name seems to help avoid
        // Gemini trying to continue as the next character, or at the very least
        // ensures it will hit the stop sequence.  Otherwise it will start a new
        // paragraph and switch perspectives.
        // The response will be very likely to include this prefix so frontends
        // will need to strip it out.
        const textPrefix = textName ? "" : `${name}: `;
        return {
            parts: [{ text: textPrefix + text }],
            role: m.role === "assistant" ? "model" : "user",
        };
    })
        .reduce((acc, msg) => {
        const last = acc[acc.length - 1];
        if (last?.role === msg.role) {
            last.parts[0].text += "\n\n" + msg.parts[0].text;
        }
        else {
            acc.push(msg);
        }
        return acc;
    }, []);
    let stops = rest.stop
        ? Array.isArray(rest.stop)
            ? rest.stop
            : [rest.stop]
        : [];
    stops.push(...Array.from(foundNames).map((name) => `\n${name}:`));
    stops = [...new Set(stops)].slice(0, 5);
    return {
        model: req.body.model,
        stream: rest.stream,
        contents,
        tools: [],
        generationConfig: {
            maxOutputTokens: rest.max_tokens,
            stopSequences: stops,
            topP: rest.top_p,
            topK: 40, // openai schema doesn't have this, google ai defaults to 40
            temperature: rest.temperature,
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
        ],
    };
};
exports.transformOpenAIToGoogleAI = transformOpenAIToGoogleAI;
//# sourceMappingURL=google-ai.js.map
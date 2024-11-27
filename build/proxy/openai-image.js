"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiImage = void 0;
const express_1 = require("express");
const openai_1 = require("./openai");
const rate_limit_1 = require("./rate-limit");
const request_1 = require("./middleware/request");
const proxy_middleware_factory_1 = require("./middleware/request/proxy-middleware-factory");
const KNOWN_MODELS = ["dall-e-2", "dall-e-3"];
let modelListCache = null;
let modelListValid = 0;
const handleModelRequest = (_req, res) => {
    if (new Date().getTime() - modelListValid < 1000 * 60) {
        return res.status(200).json(modelListCache);
    }
    const result = (0, openai_1.generateModelList)("openai").filter((m) => KNOWN_MODELS.includes(m.id));
    modelListCache = { object: "list", data: result };
    modelListValid = new Date().getTime();
    res.status(200).json(modelListCache);
};
const openaiImagesResponseHandler = async (_proxyRes, req, res, body) => {
    if (typeof body !== "object") {
        throw new Error("Expected body to be an object");
    }
    let newBody = body;
    if (req.inboundApi === "openai") {
        req.log.info("Transforming OpenAI image response to OpenAI chat format");
        newBody = transformResponseForChat(body, req);
    }
    res.status(200).json({ ...newBody, proxy: body.proxy });
};
/**
 * Transforms a DALL-E image generation response into a chat response, simply
 * embedding the image URL into the chat message as a Markdown image.
 */
function transformResponseForChat(imageBody, req) {
    const prompt = imageBody.data[0].revised_prompt ?? req.body.prompt;
    const content = imageBody.data
        .map((item) => {
        const { url, b64_json } = item;
        if (b64_json) {
            return `![${prompt}](data:image/png;base64,${b64_json})`;
        }
        else {
            return `![${prompt}](${url})`;
        }
    })
        .join("\n\n");
    return {
        id: "dalle-" + req.id,
        object: "chat.completion",
        created: Date.now(),
        model: req.body.model,
        usage: {
            prompt_tokens: 0,
            completion_tokens: req.outputTokens,
            total_tokens: req.outputTokens,
        },
        choices: [
            {
                message: { role: "assistant", content },
                finish_reason: "stop",
                index: 0,
            },
        ],
    };
}
function replacePath(manager) {
    const req = manager.request;
    const pathname = req.url.split("?")[0];
    req.log.debug({ pathname }, "OpenAI image path filter");
    if (req.path.startsWith("/v1/chat/completions")) {
        manager.setPath("/v1/images/generations");
    }
}
const openaiImagesProxy = (0, proxy_middleware_factory_1.createQueuedProxyMiddleware)({
    target: "https://api.openai.com",
    mutations: [replacePath, request_1.addKey, request_1.finalizeBody],
    blockingResponseHandler: openaiImagesResponseHandler,
});
const openaiImagesRouter = (0, express_1.Router)();
openaiImagesRouter.get("/v1/models", handleModelRequest);
openaiImagesRouter.post("/v1/images/generations", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({
    inApi: "openai-image",
    outApi: "openai-image",
    service: "openai",
}), openaiImagesProxy);
openaiImagesRouter.post("/v1/chat/completions", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({
    inApi: "openai",
    outApi: "openai-image",
    service: "openai",
}), openaiImagesProxy);
exports.openaiImage = openaiImagesRouter;
//# sourceMappingURL=openai-image.js.map
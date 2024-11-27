"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = exports.generateModelList = void 0;
const express_1 = require("express");
const config_1 = require("../config");
const key_management_1 = require("../shared/key-management");
const models_1 = require("../shared/models");
const rate_limit_1 = require("./rate-limit");
const request_1 = require("./middleware/request");
const proxy_middleware_factory_1 = require("./middleware/request/proxy-middleware-factory");
// https://platform.openai.com/docs/models/overview
let modelsCache = null;
let modelsCacheTime = 0;
function generateModelList(service) {
    const keys = key_management_1.keyPool
        .list()
        .filter((k) => k.service === service && !k.isDisabled);
    if (keys.length === 0)
        return [];
    const allowedModelFamilies = new Set(config_1.config.allowedModelFamilies);
    const modelFamilies = new Set(keys
        .flatMap((k) => k.modelFamilies)
        .filter((f) => allowedModelFamilies.has(f)));
    const modelIds = new Set(keys
        .flatMap((k) => k.modelIds)
        .filter((id) => {
        const allowed = modelFamilies.has((0, models_1.getOpenAIModelFamily)(id));
        const known = ["gpt", "o1", "dall-e", "chatgpt", "text-embedding"].some((prefix) => id.startsWith(prefix));
        const isFinetune = id.includes("ft");
        return allowed && known && !isFinetune;
    }));
    return Array.from(modelIds).map((id) => ({
        id,
        object: "model",
        created: new Date().getTime(),
        owned_by: service,
        permission: [
            {
                id: "modelperm-" + id,
                object: "model_permission",
                created: new Date().getTime(),
                organization: "*",
                group: null,
                is_blocking: false,
            },
        ],
        root: id,
        parent: null,
    }));
}
exports.generateModelList = generateModelList;
const handleModelRequest = (_req, res) => {
    if (new Date().getTime() - modelsCacheTime < 1000 * 60) {
        return res.status(200).json(modelsCache);
    }
    if (!config_1.config.openaiKey)
        return { object: "list", data: [] };
    const result = generateModelList("openai");
    modelsCache = { object: "list", data: result };
    modelsCacheTime = new Date().getTime();
    res.status(200).json(modelsCache);
};
/** Handles some turbo-instruct special cases. */
const rewriteForTurboInstruct = (req) => {
    // /v1/turbo-instruct/v1/chat/completions accepts either prompt or messages.
    // Depending on whichever is provided, we need to set the inbound format so
    // it is transformed correctly later.
    if (req.body.prompt && !req.body.messages) {
        req.inboundApi = "openai-text";
    }
    else if (req.body.messages && !req.body.prompt) {
        req.inboundApi = "openai";
        // Set model for user since they're using a client which is not aware of
        // turbo-instruct.
        req.body.model = "gpt-3.5-turbo-instruct";
    }
    else {
        throw new Error("`prompt` OR `messages` must be provided");
    }
    req.url = "/v1/completions";
};
const openaiResponseHandler = async (_proxyRes, req, res, body) => {
    if (typeof body !== "object") {
        throw new Error("Expected body to be an object");
    }
    let newBody = body;
    if (req.outboundApi === "openai-text" && req.inboundApi === "openai") {
        req.log.info("Transforming Turbo-Instruct response to Chat format");
        newBody = transformTurboInstructResponse(body);
    }
    res.status(200).json({ ...newBody, proxy: body.proxy });
};
function transformTurboInstructResponse(turboInstructBody) {
    const transformed = { ...turboInstructBody };
    transformed.choices = [
        {
            ...turboInstructBody.choices[0],
            message: {
                role: "assistant",
                content: turboInstructBody.choices[0].text.trim(),
            },
        },
    ];
    delete transformed.choices[0].text;
    return transformed;
}
const openaiProxy = (0, proxy_middleware_factory_1.createQueuedProxyMiddleware)({
    mutations: [request_1.addKey, request_1.finalizeBody],
    target: "https://api.openai.com",
    blockingResponseHandler: openaiResponseHandler,
});
const openaiEmbeddingsProxy = (0, proxy_middleware_factory_1.createQueuedProxyMiddleware)({
    mutations: [request_1.addKeyForEmbeddingsRequest, request_1.finalizeBody],
    target: "https://api.openai.com",
});
const openaiRouter = (0, express_1.Router)();
openaiRouter.get("/v1/models", handleModelRequest);
// Native text completion endpoint, only for turbo-instruct.
openaiRouter.post("/v1/completions", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({
    inApi: "openai-text",
    outApi: "openai-text",
    service: "openai",
}), openaiProxy);
// turbo-instruct compatibility endpoint, accepts either prompt or messages
openaiRouter.post(/\/v1\/turbo-instruct\/(v1\/)?chat\/completions/, rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({ inApi: "openai", outApi: "openai-text", service: "openai" }, {
    beforeTransform: [rewriteForTurboInstruct],
    afterTransform: [forceModel("gpt-3.5-turbo-instruct")],
}), openaiProxy);
// General chat completion endpoint. Turbo-instruct is not supported here.
openaiRouter.post("/v1/chat/completions", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({ inApi: "openai", outApi: "openai", service: "openai" }, { afterTransform: [fixupMaxTokens] }), openaiProxy);
// Embeddings endpoint.
openaiRouter.post("/v1/embeddings", rate_limit_1.ipLimiter, (0, request_1.createEmbeddingsPreprocessorMiddleware)(), openaiEmbeddingsProxy);
function forceModel(model) {
    return (req) => void (req.body.model = model);
}
function fixupMaxTokens(req) {
    if (!req.body.max_completion_tokens) {
        req.body.max_completion_tokens = req.body.max_tokens;
    }
    delete req.body.max_tokens;
}
exports.openai = openaiRouter;
//# sourceMappingURL=openai.js.map
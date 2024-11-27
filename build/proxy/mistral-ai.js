"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mistralAI = exports.detectMistralInputApi = exports.transformMistralTextToMistralChat = exports.generateModelList = exports.KNOWN_MISTRAL_AI_MODELS = void 0;
const express_1 = require("express");
const errors_1 = require("../shared/errors");
const key_management_1 = require("../shared/key-management");
const models_1 = require("../shared/models");
const config_1 = require("../config");
const rate_limit_1 = require("./rate-limit");
const request_1 = require("./middleware/request");
const proxy_middleware_factory_1 = require("./middleware/request/proxy-middleware-factory");
// Mistral can't settle on a single naming scheme and deprecates models within
// months of releasing them so this list is hard to keep up to date. 2024-07-28
// https://docs.mistral.ai/platform/endpoints
exports.KNOWN_MISTRAL_AI_MODELS = [
    /*
    Mistral Nemo
    "A 12B model built with the partnership with Nvidia.  It is easy to use and a
    drop-in replacement in any system using Mistral 7B that it supersedes."
    */
    "open-mistral-nemo",
    "open-mistral-nemo-2407",
    /*
    Mistral Large
    "Our flagship model with state-of-the-art reasoning, knowledge, and coding
    capabilities."
    */
    "mistral-large-latest",
    "mistral-large-2407",
    "mistral-large-2402", // deprecated
    /*
    Codestral
    "A cutting-edge generative model that has been specifically designed and
    optimized for code generation tasks, including fill-in-the-middle and code
    completion."
    note: this uses a separate bidi completion endpoint that is not implemented
    */
    "codestral-latest",
    "codestral-2405",
    /* So-called "Research Models" */
    "open-mistral-7b",
    "open-mixtral-8x7b",
    "open-mistral-8x22b",
    "open-codestral-mamba",
    /* Deprecated production models */
    "mistral-small-latest",
    "mistral-small-2402",
    "mistral-medium-latest",
    "mistral-medium-2312",
    "mistral-tiny",
    "mistral-tiny-2312",
];
let modelsCache = null;
let modelsCacheTime = 0;
function generateModelList(models = exports.KNOWN_MISTRAL_AI_MODELS) {
    let available = new Set();
    for (const key of key_management_1.keyPool.list()) {
        if (key.isDisabled || key.service !== "mistral-ai")
            continue;
        key.modelFamilies.forEach((family) => available.add(family));
    }
    const allowed = new Set(config_1.config.allowedModelFamilies);
    available = new Set([...available].filter((x) => allowed.has(x)));
    return models
        .map((id) => ({
        id,
        object: "model",
        created: new Date().getTime(),
        owned_by: "mistral-ai",
    }))
        .filter((model) => available.has((0, models_1.getMistralAIModelFamily)(model.id)));
}
exports.generateModelList = generateModelList;
const handleModelRequest = (_req, res) => {
    if (new Date().getTime() - modelsCacheTime < 1000 * 60) {
        return res.status(200).json(modelsCache);
    }
    const result = generateModelList();
    modelsCache = { object: "list", data: result };
    modelsCacheTime = new Date().getTime();
    res.status(200).json(modelsCache);
};
const mistralAIResponseHandler = async (_proxyRes, req, res, body) => {
    if (typeof body !== "object") {
        throw new Error("Expected body to be an object");
    }
    let newBody = body;
    if (req.inboundApi === "mistral-text" && req.outboundApi === "mistral-ai") {
        newBody = transformMistralTextToMistralChat(body);
    }
    res.status(200).json({ ...newBody, proxy: body.proxy });
};
function transformMistralTextToMistralChat(textBody) {
    return {
        ...textBody,
        choices: [
            { message: { content: textBody.outputs[0].text, role: "assistant" } },
        ],
        outputs: undefined,
    };
}
exports.transformMistralTextToMistralChat = transformMistralTextToMistralChat;
const mistralAIProxy = (0, proxy_middleware_factory_1.createQueuedProxyMiddleware)({
    target: "https://api.mistral.ai",
    mutations: [request_1.addKey, request_1.finalizeBody],
    blockingResponseHandler: mistralAIResponseHandler,
});
const mistralAIRouter = (0, express_1.Router)();
mistralAIRouter.get("/v1/models", handleModelRequest);
// General chat completion endpoint.
mistralAIRouter.post("/v1/chat/completions", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({
    inApi: "mistral-ai",
    outApi: "mistral-ai",
    service: "mistral-ai",
}, { beforeTransform: [detectMistralInputApi] }), mistralAIProxy);
/**
 * We can't determine if a request is Mistral text or chat just from the path
 * because they both use the same endpoint. We need to check the request body
 * for either `messages` or `prompt`.
 * @param req
 */
function detectMistralInputApi(req) {
    const { messages, prompt } = req.body;
    if (messages) {
        req.inboundApi = "mistral-ai";
        req.outboundApi = "mistral-ai";
    }
    else if (prompt && req.service === "mistral-ai") {
        // Mistral La Plateforme doesn't expose a text completions endpoint.
        throw new errors_1.BadRequestError("Mistral (via La Plateforme API) does not support text completions. This format is only supported on Mistral via the AWS API.");
    }
    else if (prompt && req.service === "aws") {
        req.inboundApi = "mistral-text";
        req.outboundApi = "mistral-text";
    }
}
exports.detectMistralInputApi = detectMistralInputApi;
exports.mistralAI = mistralAIRouter;
//# sourceMappingURL=mistral-ai.js.map
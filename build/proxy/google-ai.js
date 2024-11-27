"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleAI = void 0;
const express_1 = require("express");
const uuid_1 = require("uuid");
const key_management_1 = require("../shared/key-management");
const config_1 = require("../config");
const rate_limit_1 = require("./rate-limit");
const request_1 = require("./middleware/request");
const add_google_ai_key_1 = require("./middleware/request/mutators/add-google-ai-key");
const proxy_middleware_factory_1 = require("./middleware/request/proxy-middleware-factory");
let modelsCache = null;
let modelsCacheTime = 0;
// https://ai.google.dev/models/gemini
// TODO: list models https://ai.google.dev/tutorials/rest_quickstart#list_models
const getModelsResponse = () => {
    if (new Date().getTime() - modelsCacheTime < 1000 * 60) {
        return modelsCache;
    }
    if (!config_1.config.googleAIKey)
        return { object: "list", data: [] };
    const keys = key_management_1.keyPool
        .list()
        .filter((k) => k.service === "google-ai");
    if (keys.length === 0) {
        modelsCache = { object: "list", data: [] };
        modelsCacheTime = new Date().getTime();
        return modelsCache;
    }
    const modelIds = Array.from(new Set(keys.map((k) => k.modelIds).flat())).filter((id) => id.startsWith("models/gemini"));
    const models = modelIds.map((id) => ({
        id,
        object: "model",
        created: new Date().getTime(),
        owned_by: "google",
        permission: [],
        root: "google",
        parent: null,
    }));
    modelsCache = { object: "list", data: models };
    modelsCacheTime = new Date().getTime();
    return modelsCache;
};
const handleModelRequest = (_req, res) => {
    res.status(200).json(getModelsResponse());
};
const googleAIBlockingResponseHandler = async (_proxyRes, req, res, body) => {
    if (typeof body !== "object") {
        throw new Error("Expected body to be an object");
    }
    let newBody = body;
    if (req.inboundApi === "openai") {
        req.log.info("Transforming Google AI response to OpenAI format");
        newBody = transformGoogleAIResponse(body, req);
    }
    res.status(200).json({ ...newBody, proxy: body.proxy });
};
function transformGoogleAIResponse(resBody, req) {
    const totalTokens = (req.promptTokens ?? 0) + (req.outputTokens ?? 0);
    const parts = resBody.candidates[0].content?.parts ?? [{ text: "" }];
    const content = parts[0].text.replace(/^(.{0,50}?): /, () => "");
    return {
        id: "goo-" + (0, uuid_1.v4)(),
        object: "chat.completion",
        created: Date.now(),
        model: req.body.model,
        usage: {
            prompt_tokens: req.promptTokens,
            completion_tokens: req.outputTokens,
            total_tokens: totalTokens,
        },
        choices: [
            {
                message: { role: "assistant", content },
                finish_reason: resBody.candidates[0].finishReason,
                index: 0,
            },
        ],
    };
}
const googleAIProxy = (0, proxy_middleware_factory_1.createQueuedProxyMiddleware)({
    target: ({ signedRequest }) => {
        if (!signedRequest)
            throw new Error("Must sign request before proxying");
        const { protocol, hostname } = signedRequest;
        return `${protocol}//${hostname}`;
    },
    mutations: [add_google_ai_key_1.addGoogleAIKey, request_1.finalizeSignedRequest],
    blockingResponseHandler: googleAIBlockingResponseHandler,
});
const googleAIRouter = (0, express_1.Router)();
googleAIRouter.get("/v1/models", handleModelRequest);
// Native Google AI chat completion endpoint
googleAIRouter.post("/v1beta/models/:modelId:(generateContent|streamGenerateContent)", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({ inApi: "google-ai", outApi: "google-ai", service: "google-ai" }, { beforeTransform: [maybeReassignModel], afterTransform: [setStreamFlag] }), googleAIProxy);
// OpenAI-to-Google AI compatibility endpoint.
googleAIRouter.post("/v1/chat/completions", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({ inApi: "openai", outApi: "google-ai", service: "google-ai" }, { afterTransform: [maybeReassignModel] }), googleAIProxy);
function setStreamFlag(req) {
    const isStreaming = req.url.includes("streamGenerateContent");
    if (isStreaming) {
        req.body.stream = true;
        req.isStreaming = true;
    }
    else {
        req.body.stream = false;
        req.isStreaming = false;
    }
}
/**
 * Replaces requests for non-Google AI models with gemini-1.5-pro-latest.
 * Also strips models/ from the beginning of the model IDs.
 **/
function maybeReassignModel(req) {
    // Ensure model is on body as a lot of middleware will expect it.
    const model = req.body.model || req.url.split("/").pop()?.split(":").shift();
    if (!model) {
        throw new Error("You must specify a model with your request.");
    }
    req.body.model = model;
    const requested = model;
    if (requested.startsWith("models/")) {
        req.body.model = requested.slice("models/".length);
    }
    if (requested.includes("gemini")) {
        return;
    }
    req.log.info({ requested }, "Reassigning model to gemini-1.5-pro-latest");
    req.body.model = "gemini-1.5-pro-latest";
}
exports.googleAI = googleAIRouter;
//# sourceMappingURL=google-ai.js.map
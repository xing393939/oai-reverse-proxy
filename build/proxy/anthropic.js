"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropic = exports.transformAnthropicChatResponseToOpenAI = exports.transformAnthropicChatResponseToAnthropicText = void 0;
const express_1 = require("express");
const config_1 = require("../config");
const rate_limit_1 = require("./rate-limit");
const request_1 = require("./middleware/request");
const proxy_middleware_factory_1 = require("./middleware/request/proxy-middleware-factory");
let modelsCache = null;
let modelsCacheTime = 0;
const getModelsResponse = () => {
    if (new Date().getTime() - modelsCacheTime < 1000 * 60) {
        return modelsCache;
    }
    if (!config_1.config.anthropicKey)
        return { object: "list", data: [] };
    const claudeVariants = [
        "claude-v1",
        "claude-v1-100k",
        "claude-instant-v1",
        "claude-instant-v1-100k",
        "claude-v1.3",
        "claude-v1.3-100k",
        "claude-v1.2",
        "claude-v1.0",
        "claude-instant-v1.1",
        "claude-instant-v1.1-100k",
        "claude-instant-v1.0",
        "claude-2",
        "claude-2.0",
        "claude-2.1",
        "claude-3-haiku-20240307",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-3-opus-latest",
        "claude-3-sonnet-20240229",
        "claude-3-5-sonnet-20240620",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-sonnet-latest",
    ];
    const models = claudeVariants.map((id) => ({
        id,
        object: "model",
        created: new Date().getTime(),
        owned_by: "anthropic",
        permission: [],
        root: "claude",
        parent: null,
    }));
    modelsCache = { object: "list", data: models };
    modelsCacheTime = new Date().getTime();
    return modelsCache;
};
const handleModelRequest = (_req, res) => {
    res.status(200).json(getModelsResponse());
};
const anthropicBlockingResponseHandler = async (_proxyRes, req, res, body) => {
    if (typeof body !== "object") {
        throw new Error("Expected body to be an object");
    }
    let newBody = body;
    switch (`${req.inboundApi}<-${req.outboundApi}`) {
        case "openai<-anthropic-text":
            req.log.info("Transforming Anthropic Text back to OpenAI format");
            newBody = transformAnthropicTextResponseToOpenAI(body, req);
            break;
        case "openai<-anthropic-chat":
            req.log.info("Transforming Anthropic Chat back to OpenAI format");
            newBody = transformAnthropicChatResponseToOpenAI(body);
            break;
        case "anthropic-text<-anthropic-chat":
            req.log.info("Transforming Anthropic Chat back to Anthropic chat format");
            newBody = transformAnthropicChatResponseToAnthropicText(body);
            break;
    }
    res.status(200).json({ ...newBody, proxy: body.proxy });
};
function flattenChatResponse(content) {
    return content
        .map((part) => part.type === "text" ? part.text : "")
        .join("\n");
}
function transformAnthropicChatResponseToAnthropicText(anthropicBody) {
    return {
        type: "completion",
        id: "ant-" + anthropicBody.id,
        completion: flattenChatResponse(anthropicBody.content),
        stop_reason: anthropicBody.stop_reason,
        stop: anthropicBody.stop_sequence,
        model: anthropicBody.model,
        usage: anthropicBody.usage,
    };
}
exports.transformAnthropicChatResponseToAnthropicText = transformAnthropicChatResponseToAnthropicText;
function transformAnthropicTextResponseToOpenAI(anthropicBody, req) {
    const totalTokens = (req.promptTokens ?? 0) + (req.outputTokens ?? 0);
    return {
        id: "ant-" + anthropicBody.log_id,
        object: "chat.completion",
        created: Date.now(),
        model: anthropicBody.model,
        usage: {
            prompt_tokens: req.promptTokens,
            completion_tokens: req.outputTokens,
            total_tokens: totalTokens,
        },
        choices: [
            {
                message: {
                    role: "assistant",
                    content: anthropicBody.completion?.trim(),
                },
                finish_reason: anthropicBody.stop_reason,
                index: 0,
            },
        ],
    };
}
function transformAnthropicChatResponseToOpenAI(anthropicBody) {
    return {
        id: "ant-" + anthropicBody.id,
        object: "chat.completion",
        created: Date.now(),
        model: anthropicBody.model,
        usage: anthropicBody.usage,
        choices: [
            {
                message: {
                    role: "assistant",
                    content: flattenChatResponse(anthropicBody.content),
                },
                finish_reason: anthropicBody.stop_reason,
                index: 0,
            },
        ],
    };
}
exports.transformAnthropicChatResponseToOpenAI = transformAnthropicChatResponseToOpenAI;
/**
 * If a client using the OpenAI compatibility endpoint requests an actual OpenAI
 * model, reassigns it to Sonnet.
 */
function maybeReassignModel(req) {
    const model = req.body.model;
    if (model.includes("claude"))
        return; // use whatever model the user requested
    req.body.model = "claude-3-5-sonnet-latest";
}
/**
 * If client requests more than 4096 output tokens the request must have a
 * particular version header.
 * https://docs.anthropic.com/en/release-notes/api#july-15th-2024
 */
function setAnthropicBetaHeader(req) {
    const { max_tokens_to_sample } = req.body;
    if (max_tokens_to_sample > 4096) {
        req.headers["anthropic-beta"] = "max-tokens-3-5-sonnet-2024-07-15";
    }
}
function selectUpstreamPath(manager) {
    const req = manager.request;
    const pathname = req.url.split("?")[0];
    req.log.debug({ pathname }, "Anthropic path filter");
    const isText = req.outboundApi === "anthropic-text";
    const isChat = req.outboundApi === "anthropic-chat";
    if (isChat && pathname === "/v1/complete") {
        manager.setPath("/v1/messages");
    }
    if (isText && pathname === "/v1/chat/completions") {
        manager.setPath("/v1/complete");
    }
    if (isChat && pathname === "/v1/chat/completions") {
        manager.setPath("/v1/messages");
    }
    if (isChat && ["sonnet", "opus"].includes(req.params.type)) {
        manager.setPath("/v1/messages");
    }
}
const anthropicProxy = (0, proxy_middleware_factory_1.createQueuedProxyMiddleware)({
    target: "https://api.anthropic.com",
    mutations: [selectUpstreamPath, request_1.addKey, request_1.finalizeBody],
    blockingResponseHandler: anthropicBlockingResponseHandler,
});
const nativeAnthropicChatPreprocessor = (0, request_1.createPreprocessorMiddleware)({ inApi: "anthropic-chat", outApi: "anthropic-chat", service: "anthropic" }, { afterTransform: [setAnthropicBetaHeader] });
const nativeTextPreprocessor = (0, request_1.createPreprocessorMiddleware)({
    inApi: "anthropic-text",
    outApi: "anthropic-text",
    service: "anthropic",
});
const textToChatPreprocessor = (0, request_1.createPreprocessorMiddleware)({
    inApi: "anthropic-text",
    outApi: "anthropic-chat",
    service: "anthropic",
});
/**
 * Routes text completion prompts to anthropic-chat if they need translation
 * (claude-3 based models do not support the old text completion endpoint).
 */
const preprocessAnthropicTextRequest = (req, res, next) => {
    if (req.body.model?.startsWith("claude-3")) {
        textToChatPreprocessor(req, res, next);
    }
    else {
        nativeTextPreprocessor(req, res, next);
    }
};
const oaiToTextPreprocessor = (0, request_1.createPreprocessorMiddleware)({
    inApi: "openai",
    outApi: "anthropic-text",
    service: "anthropic",
});
const oaiToChatPreprocessor = (0, request_1.createPreprocessorMiddleware)({
    inApi: "openai",
    outApi: "anthropic-chat",
    service: "anthropic",
});
/**
 * Routes an OpenAI prompt to either the legacy Claude text completion endpoint
 * or the new Claude chat completion endpoint, based on the requested model.
 */
const preprocessOpenAICompatRequest = (req, res, next) => {
    maybeReassignModel(req);
    if (req.body.model?.includes("claude-3")) {
        oaiToChatPreprocessor(req, res, next);
    }
    else {
        oaiToTextPreprocessor(req, res, next);
    }
};
const anthropicRouter = (0, express_1.Router)();
anthropicRouter.get("/v1/models", handleModelRequest);
// Native Anthropic chat completion endpoint.
anthropicRouter.post("/v1/messages", rate_limit_1.ipLimiter, nativeAnthropicChatPreprocessor, anthropicProxy);
// Anthropic text completion endpoint. Translates to Anthropic chat completion
// if the requested model is a Claude 3 model.
anthropicRouter.post("/v1/complete", rate_limit_1.ipLimiter, preprocessAnthropicTextRequest, anthropicProxy);
// OpenAI-to-Anthropic compatibility endpoint. Accepts an OpenAI chat completion
// request and transforms/routes it to the appropriate Anthropic format and
// endpoint based on the requested model.
anthropicRouter.post("/v1/chat/completions", rate_limit_1.ipLimiter, preprocessOpenAICompatRequest, anthropicProxy);
exports.anthropic = anthropicRouter;
//# sourceMappingURL=anthropic.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.awsClaude = void 0;
const express_1 = require("express");
const uuid_1 = require("uuid");
const anthropic_1 = require("./anthropic");
const rate_limit_1 = require("./rate-limit");
const request_1 = require("./middleware/request");
const proxy_middleware_factory_1 = require("./middleware/request/proxy-middleware-factory");
const awsBlockingResponseHandler = async (_proxyRes, req, res, body) => {
    if (typeof body !== "object") {
        throw new Error("Expected body to be an object");
    }
    let newBody = body;
    switch (`${req.inboundApi}<-${req.outboundApi}`) {
        case "openai<-anthropic-text":
            req.log.info("Transforming Anthropic Text back to OpenAI format");
            newBody = transformAwsTextResponseToOpenAI(body, req);
            break;
        case "openai<-anthropic-chat":
            req.log.info("Transforming AWS Anthropic Chat back to OpenAI format");
            newBody = (0, anthropic_1.transformAnthropicChatResponseToOpenAI)(body);
            break;
        case "anthropic-text<-anthropic-chat":
            req.log.info("Transforming AWS Anthropic Chat back to Text format");
            newBody = (0, anthropic_1.transformAnthropicChatResponseToAnthropicText)(body);
            break;
    }
    // AWS does not always confirm the model in the response, so we have to add it
    if (!newBody.model && req.body.model) {
        newBody.model = req.body.model;
    }
    res.status(200).json({ ...newBody, proxy: body.proxy });
};
function transformAwsTextResponseToOpenAI(awsBody, req) {
    const totalTokens = (req.promptTokens ?? 0) + (req.outputTokens ?? 0);
    return {
        id: "aws-" + (0, uuid_1.v4)(),
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
                message: {
                    role: "assistant",
                    content: awsBody.completion?.trim(),
                },
                finish_reason: awsBody.stop_reason,
                index: 0,
            },
        ],
    };
}
const awsClaudeProxy = (0, proxy_middleware_factory_1.createQueuedProxyMiddleware)({
    target: ({ signedRequest }) => {
        if (!signedRequest)
            throw new Error("Must sign request before proxying");
        return `${signedRequest.protocol}//${signedRequest.hostname}`;
    },
    mutations: [request_1.signAwsRequest, request_1.finalizeSignedRequest],
    blockingResponseHandler: awsBlockingResponseHandler,
});
const nativeTextPreprocessor = (0, request_1.createPreprocessorMiddleware)({ inApi: "anthropic-text", outApi: "anthropic-text", service: "aws" }, { afterTransform: [maybeReassignModel] });
const textToChatPreprocessor = (0, request_1.createPreprocessorMiddleware)({ inApi: "anthropic-text", outApi: "anthropic-chat", service: "aws" }, { afterTransform: [maybeReassignModel] });
/**
 * Routes text completion prompts to aws anthropic-chat if they need translation
 * (claude-3 based models do not support the old text completion endpoint).
 */
const preprocessAwsTextRequest = (req, res, next) => {
    if (req.body.model?.includes("claude-3")) {
        textToChatPreprocessor(req, res, next);
    }
    else {
        nativeTextPreprocessor(req, res, next);
    }
};
const oaiToAwsTextPreprocessor = (0, request_1.createPreprocessorMiddleware)({ inApi: "openai", outApi: "anthropic-text", service: "aws" }, { afterTransform: [maybeReassignModel] });
const oaiToAwsChatPreprocessor = (0, request_1.createPreprocessorMiddleware)({ inApi: "openai", outApi: "anthropic-chat", service: "aws" }, { afterTransform: [maybeReassignModel] });
/**
 * Routes an OpenAI prompt to either the legacy Claude text completion endpoint
 * or the new Claude chat completion endpoint, based on the requested model.
 */
const preprocessOpenAICompatRequest = (req, res, next) => {
    if (req.body.model?.includes("claude-3")) {
        oaiToAwsChatPreprocessor(req, res, next);
    }
    else {
        oaiToAwsTextPreprocessor(req, res, next);
    }
};
const awsClaudeRouter = (0, express_1.Router)();
// Native(ish) Anthropic text completion endpoint.
awsClaudeRouter.post("/v1/complete", rate_limit_1.ipLimiter, preprocessAwsTextRequest, awsClaudeProxy);
// Native Anthropic chat completion endpoint.
awsClaudeRouter.post("/v1/messages", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({ inApi: "anthropic-chat", outApi: "anthropic-chat", service: "aws" }, { afterTransform: [maybeReassignModel] }), awsClaudeProxy);
// OpenAI-to-AWS Anthropic compatibility endpoint.
awsClaudeRouter.post("/v1/chat/completions", rate_limit_1.ipLimiter, preprocessOpenAICompatRequest, awsClaudeProxy);
/**
 * Tries to deal with:
 * - frontends sending AWS model names even when they want to use the OpenAI-
 *   compatible endpoint
 * - frontends sending Anthropic model names that AWS doesn't recognize
 * - frontends sending OpenAI model names because they expect the proxy to
 *   translate them
 *
 * If client sends AWS model ID it will be used verbatim. Otherwise, various
 * strategies are used to try to map a non-AWS model name to AWS model ID.
 */
function maybeReassignModel(req) {
    const model = req.body.model;
    // If it looks like an AWS model, use it as-is
    if (model.includes("anthropic.claude")) {
        return;
    }
    // Anthropic model names can look like:
    // - claude-v1
    // - claude-2.1
    // - claude-3-5-sonnet-20240620
    // - claude-3-opus-latest
    const pattern = /^(claude-)?(instant-)?(v)?(\d+)([.-](\d))?(-\d+k)?(-sonnet-|-opus-|-haiku-)?(latest|\d*)/i;
    const match = model.match(pattern);
    if (!match) {
        throw new Error(`Provided model name (${model}) doesn't resemble a Claude model ID.`);
    }
    const [_, _cl, instant, _v, major, _sep, minor, _ctx, rawName, rev] = match;
    if (instant) {
        req.body.model = "anthropic.claude-instant-v1";
        return;
    }
    const ver = minor ? `${major}.${minor}` : major;
    const name = rawName?.match(/([a-z]+)/)?.[1] || "";
    switch (ver) {
        case "1":
        case "1.0":
            req.body.model = "anthropic.claude-v1";
            return;
        case "2":
        case "2.0":
            req.body.model = "anthropic.claude-v2";
            return;
        case "2.1":
            req.body.model = "anthropic.claude-v2:1";
            return;
        case "3":
        case "3.0":
            // there is only one snapshot for all Claude 3 models so there is no need
            // to check the revision
            switch (name) {
                case "sonnet":
                    req.body.model = "anthropic.claude-3-sonnet-20240229-v1:0";
                    return;
                case "haiku":
                    req.body.model = "anthropic.claude-3-haiku-20240307-v1:0";
                    return;
                case "opus":
                    req.body.model = "anthropic.claude-3-opus-20240229-v1:0";
                    return;
            }
            break;
        case "3.5":
            switch (name) {
                case "sonnet":
                    switch (rev) {
                        case "20241022":
                        case "latest":
                            req.body.model = "anthropic.claude-3-5-sonnet-20241022-v2:0";
                            return;
                        case "20240620":
                            req.body.model = "anthropic.claude-3-5-sonnet-20240620-v1:0";
                            return;
                    }
                    break;
                case "haiku":
                    switch (rev) {
                        case "20241022":
                        case "latest":
                            req.body.model = "anthropic.claude-3-5-haiku-20241022-v1:0";
                            return;
                    }
                case "opus":
                    // Add after model id is announced never
                    break;
            }
    }
    throw new Error(`Provided model name (${model}) could not be mapped to a known AWS Claude model ID.`);
}
exports.awsClaude = awsClaudeRouter;
//# sourceMappingURL=aws-claude.js.map
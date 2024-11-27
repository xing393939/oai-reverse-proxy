"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.awsMistral = void 0;
const express_1 = require("express");
const mistral_ai_1 = require("./mistral-ai");
const rate_limit_1 = require("./rate-limit");
const request_1 = require("./middleware/request");
const proxy_middleware_factory_1 = require("./middleware/request/proxy-middleware-factory");
const awsMistralBlockingResponseHandler = async (_proxyRes, req, res, body) => {
    if (typeof body !== "object") {
        throw new Error("Expected body to be an object");
    }
    let newBody = body;
    if (req.inboundApi === "mistral-ai" && req.outboundApi === "mistral-text") {
        newBody = (0, mistral_ai_1.transformMistralTextToMistralChat)(body);
    }
    // AWS does not always confirm the model in the response, so we have to add it
    if (!newBody.model && req.body.model) {
        newBody.model = req.body.model;
    }
    res.status(200).json({ ...newBody, proxy: body.proxy });
};
const awsMistralProxy = (0, proxy_middleware_factory_1.createQueuedProxyMiddleware)({
    target: ({ signedRequest }) => {
        if (!signedRequest)
            throw new Error("Must sign request before proxying");
        return `${signedRequest.protocol}//${signedRequest.hostname}`;
    },
    mutations: [request_1.signAwsRequest, request_1.finalizeSignedRequest],
    blockingResponseHandler: awsMistralBlockingResponseHandler,
});
function maybeReassignModel(req) {
    const model = req.body.model;
    // If it looks like an AWS model, use it as-is
    if (model.startsWith("mistral.")) {
        return;
    }
    // Mistral 7B Instruct
    else if (model.includes("7b")) {
        req.body.model = "mistral.mistral-7b-instruct-v0:2";
    }
    // Mistral 8x7B Instruct
    else if (model.includes("8x7b")) {
        req.body.model = "mistral.mixtral-8x7b-instruct-v0:1";
    }
    // Mistral Large (Feb 2024)
    else if (model.includes("large-2402")) {
        req.body.model = "mistral.mistral-large-2402-v1:0";
    }
    // Mistral Large 2 (July 2024)
    else if (model.includes("large")) {
        req.body.model = "mistral.mistral-large-2407-v1:0";
    }
    // Mistral Small (Feb 2024)
    else if (model.includes("small")) {
        req.body.model = "mistral.mistral-small-2402-v1:0";
    }
    else {
        throw new Error(`Can't map '${model}' to a supported AWS model ID; make sure you are requesting a Mistral model supported by Amazon Bedrock`);
    }
}
const nativeMistralChatPreprocessor = (0, request_1.createPreprocessorMiddleware)({ inApi: "mistral-ai", outApi: "mistral-ai", service: "aws" }, {
    beforeTransform: [mistral_ai_1.detectMistralInputApi],
    afterTransform: [maybeReassignModel],
});
const awsMistralRouter = (0, express_1.Router)();
awsMistralRouter.post("/v1/chat/completions", rate_limit_1.ipLimiter, nativeMistralChatPreprocessor, awsMistralProxy);
exports.awsMistral = awsMistralRouter;
//# sourceMappingURL=aws-mistral.js.map
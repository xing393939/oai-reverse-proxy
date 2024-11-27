"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.azure = void 0;
const express_1 = require("express");
const config_1 = require("../config");
const openai_1 = require("./openai");
const rate_limit_1 = require("./rate-limit");
const request_1 = require("./middleware/request");
const proxy_middleware_factory_1 = require("./middleware/request/proxy-middleware-factory");
let modelsCache = null;
let modelsCacheTime = 0;
const handleModelRequest = (_req, res) => {
    if (new Date().getTime() - modelsCacheTime < 1000 * 60) {
        return res.status(200).json(modelsCache);
    }
    if (!config_1.config.azureCredentials)
        return { object: "list", data: [] };
    const result = (0, openai_1.generateModelList)("azure");
    modelsCache = { object: "list", data: result };
    modelsCacheTime = new Date().getTime();
    res.status(200).json(modelsCache);
};
const azureOpenaiResponseHandler = async (_proxyRes, req, res, body) => {
    if (typeof body !== "object") {
        throw new Error("Expected body to be an object");
    }
    res.status(200).json({ ...body, proxy: body.proxy });
};
const azureOpenAIProxy = (0, proxy_middleware_factory_1.createQueuedProxyMiddleware)({
    target: ({ signedRequest }) => {
        if (!signedRequest)
            throw new Error("Must sign request before proxying");
        const { hostname, protocol } = signedRequest;
        return `${protocol}//${hostname}`;
    },
    mutations: [request_1.addAzureKey, request_1.finalizeSignedRequest],
    blockingResponseHandler: azureOpenaiResponseHandler,
});
const azureOpenAIRouter = (0, express_1.Router)();
azureOpenAIRouter.get("/v1/models", handleModelRequest);
azureOpenAIRouter.post("/v1/chat/completions", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({
    inApi: "openai",
    outApi: "openai",
    service: "azure",
}), azureOpenAIProxy);
azureOpenAIRouter.post("/v1/images/generations", rate_limit_1.ipLimiter, (0, request_1.createPreprocessorMiddleware)({
    inApi: "openai-image",
    outApi: "openai-image",
    service: "azure",
}), azureOpenAIProxy);
exports.azure = azureOpenAIRouter;
//# sourceMappingURL=azure.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addKeyForEmbeddingsRequest = exports.addKey = void 0;
const anthropic_1 = require("../../../../shared/api-schemas/anthropic");
const key_management_1 = require("../../../../shared/key-management");
const common_1 = require("../../common");
const utils_1 = require("../../../../shared/utils");
const addKey = (manager) => {
    const req = manager.request;
    let assignedKey;
    const { service, inboundApi, outboundApi, body } = req;
    if (!inboundApi || !outboundApi) {
        const err = new Error("Request API format missing. Did you forget to add the request preprocessor to your router?");
        req.log.error({ inboundApi, outboundApi, path: req.path }, err.message);
        throw err;
    }
    if (!body?.model) {
        throw new Error("You must specify a model with your request.");
    }
    let needsMultimodal = false;
    if (outboundApi === "anthropic-chat") {
        needsMultimodal = (0, anthropic_1.containsImageContent)(body.messages);
    }
    if (inboundApi === outboundApi) {
        assignedKey = key_management_1.keyPool.get(body.model, service, needsMultimodal);
    }
    else {
        switch (outboundApi) {
            // If we are translating between API formats we may need to select a model
            // for the user, because the provided model is for the inbound API.
            // TODO: This whole else condition is probably no longer needed since API
            // translation now reassigns the model earlier in the request pipeline.
            case "anthropic-text":
            case "anthropic-chat":
            case "mistral-ai":
            case "mistral-text":
            case "google-ai":
                assignedKey = key_management_1.keyPool.get(body.model, service);
                break;
            case "openai-text":
                assignedKey = key_management_1.keyPool.get("gpt-3.5-turbo-instruct", service);
                break;
            case "openai-image":
                assignedKey = key_management_1.keyPool.get("dall-e-3", service);
                break;
            case "openai":
                throw new Error(`Outbound API ${outboundApi} is not supported for ${inboundApi}`);
            default:
                (0, utils_1.assertNever)(outboundApi);
        }
    }
    manager.setKey(assignedKey);
    req.log.info({ key: assignedKey.hash, model: body.model, inboundApi, outboundApi }, "Assigned key to request");
    // TODO: KeyProvider should assemble all necessary headers
    switch (assignedKey.service) {
        case "anthropic":
            manager.setHeader("X-API-Key", assignedKey.key);
            if (!manager.request.headers["anthropic-version"]) {
                manager.setHeader("anthropic-version", "2023-06-01");
            }
            break;
        case "openai":
            const key = assignedKey;
            if (key.organizationId && !key.key.includes("svcacct")) {
                manager.setHeader("OpenAI-Organization", key.organizationId);
            }
            manager.setHeader("Authorization", `Bearer ${assignedKey.key}`);
            break;
        case "mistral-ai":
            manager.setHeader("Authorization", `Bearer ${assignedKey.key}`);
            break;
        case "azure":
            const azureKey = assignedKey.key;
            manager.setHeader("api-key", azureKey);
            break;
        case "aws":
        case "gcp":
        case "google-ai":
            throw new Error("add-key should not be used for this service.");
        default:
            (0, utils_1.assertNever)(assignedKey.service);
    }
};
exports.addKey = addKey;
/**
 * Special case for embeddings requests which don't go through the normal
 * request pipeline.
 */
const addKeyForEmbeddingsRequest = (manager) => {
    const req = manager.request;
    if (!(0, common_1.isEmbeddingsRequest)(req)) {
        throw new Error("addKeyForEmbeddingsRequest called on non-embeddings request");
    }
    if (req.inboundApi !== "openai") {
        throw new Error("Embeddings requests must be from OpenAI");
    }
    manager.setBody({ input: req.body.input, model: "text-embedding-ada-002" });
    const key = key_management_1.keyPool.get("text-embedding-ada-002", "openai");
    manager.setKey(key);
    req.log.info({ key: key.hash, toApi: req.outboundApi }, "Assigned Turbo key to embeddings request");
    manager.setHeader("Authorization", `Bearer ${key.key}`);
    if (key.organizationId) {
        manager.setHeader("OpenAI-Organization", key.organizationId);
    }
};
exports.addKeyForEmbeddingsRequest = addKeyForEmbeddingsRequest;
//# sourceMappingURL=add-key.js.map
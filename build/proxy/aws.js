"use strict";
/* Shared code between AWS Claude and AWS Mistral endpoints. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aws = void 0;
const express_1 = require("express");
const config_1 = require("../config");
const add_v1_1 = require("./add-v1");
const aws_claude_1 = require("./aws-claude");
const aws_mistral_1 = require("./aws-mistral");
const key_management_1 = require("../shared/key-management");
const awsRouter = (0, express_1.Router)();
awsRouter.get(["/:vendor?/v1/models", "/:vendor?/models"], handleModelsRequest);
awsRouter.use("/claude", add_v1_1.addV1, aws_claude_1.awsClaude);
awsRouter.use("/mistral", add_v1_1.addV1, aws_mistral_1.awsMistral);
const MODELS_CACHE_TTL = 10000;
let modelsCache = {};
let modelsCacheTime = {};
function handleModelsRequest(req, res) {
    if (!config_1.config.awsCredentials)
        return { object: "list", data: [] };
    const vendor = req.params.vendor?.length
        ? req.params.vendor === "claude"
            ? "anthropic"
            : req.params.vendor
        : "all";
    const cacheTime = modelsCacheTime[vendor] || 0;
    if (new Date().getTime() - cacheTime < MODELS_CACHE_TTL) {
        return res.json(modelsCache[vendor]);
    }
    const availableModelIds = new Set();
    for (const key of key_management_1.keyPool.list()) {
        if (key.isDisabled || key.service !== "aws")
            continue;
        key.modelIds.forEach((id) => availableModelIds.add(id));
    }
    // https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html
    const models = [
        "anthropic.claude-v2",
        "anthropic.claude-v2:1",
        "anthropic.claude-3-haiku-20240307-v1:0",
        "anthropic.claude-3-5-haiku-20241022-v1:0",
        "anthropic.claude-3-sonnet-20240229-v1:0",
        "anthropic.claude-3-5-sonnet-20240620-v1:0",
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "anthropic.claude-3-opus-20240229-v1:0",
        "mistral.mistral-7b-instruct-v0:2",
        "mistral.mixtral-8x7b-instruct-v0:1",
        "mistral.mistral-large-2402-v1:0",
        "mistral.mistral-large-2407-v1:0",
        "mistral.mistral-small-2402-v1:0",
    ]
        .filter((id) => availableModelIds.has(id))
        .map((id) => {
        const vendor = id.match(/^(.*)\./)?.[1];
        return {
            id,
            object: "model",
            created: new Date().getTime(),
            owned_by: vendor,
            permission: [],
            root: vendor,
            parent: null,
        };
    });
    modelsCache[vendor] = {
        object: "list",
        data: models.filter((m) => vendor === "all" || m.root === vendor),
    };
    modelsCacheTime[vendor] = new Date().getTime();
    return res.json(modelsCache[vendor]);
}
exports.aws = awsRouter;
//# sourceMappingURL=aws.js.map
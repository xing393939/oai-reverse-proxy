"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signGcpRequest = void 0;
const api_schemas_1 = require("../../../../shared/api-schemas");
const key_management_1 = require("../../../../shared/key-management");
const oauth_1 = require("../../../../shared/key-management/gcp/oauth");
const GCP_HOST = process.env.GCP_HOST || "%REGION%-aiplatform.googleapis.com";
const signGcpRequest = async (manager) => {
    const req = manager.request;
    const serviceValid = req.service === "gcp";
    if (!serviceValid) {
        throw new Error("addVertexAIKey called on invalid request");
    }
    if (!req.body?.model) {
        throw new Error("You must specify a model with your request.");
    }
    const { model } = req.body;
    const key = key_management_1.keyPool.get(model, "gcp");
    if (!key.accessToken || Date.now() > key.accessTokenExpiresAt) {
        const [token, durationSec] = await (0, oauth_1.refreshGcpAccessToken)(key);
        key_management_1.keyPool.update(key, {
            accessToken: token,
            accessTokenExpiresAt: Date.now() + durationSec * 1000 * 0.95,
        });
        // nb: key received by `get` is a clone and will not have the new access
        // token we just set, so it must be manually updated.
        key.accessToken = token;
    }
    manager.setKey(key);
    req.log.info({ key: key.hash, model }, "Assigned GCP key to request");
    // TODO: This should happen in transform-outbound-payload.ts
    // TODO: Support tools
    let strippedParams;
    strippedParams = api_schemas_1.AnthropicV1MessagesSchema.pick({
        messages: true,
        system: true,
        max_tokens: true,
        stop_sequences: true,
        temperature: true,
        top_k: true,
        top_p: true,
        stream: true,
    })
        .strip()
        .parse(req.body);
    strippedParams.anthropic_version = "vertex-2023-10-16";
    const credential = await (0, oauth_1.getCredentialsFromGcpKey)(key);
    const host = GCP_HOST.replace("%REGION%", credential.region);
    // GCP doesn't use the anthropic-version header, but we set it to ensure the
    // stream adapter selects the correct transformer.
    manager.setHeader("anthropic-version", "2023-06-01");
    manager.setSignedRequest({
        method: "POST",
        protocol: "https:",
        hostname: host,
        path: `/v1/projects/${credential.projectId}/locations/${credential.region}/publishers/anthropic/models/${model}:streamRawPredict`,
        headers: {
            ["host"]: host,
            ["content-type"]: "application/json",
            ["authorization"]: `Bearer ${key.accessToken}`,
        },
        body: JSON.stringify(strippedParams),
    });
};
exports.signGcpRequest = signGcpRequest;
//# sourceMappingURL=sign-vertex-ai-request.js.map
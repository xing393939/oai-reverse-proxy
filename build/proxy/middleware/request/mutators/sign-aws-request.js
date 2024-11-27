"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAwsRequest = void 0;
const sha256_js_1 = require("@aws-crypto/sha256-js");
const signature_v4_1 = require("@smithy/signature-v4");
const protocol_http_1 = require("@smithy/protocol-http");
const api_schemas_1 = require("../../../../shared/api-schemas");
const key_management_1 = require("../../../../shared/key-management");
const mistral_ai_1 = require("../../../../shared/api-schemas/mistral-ai");
const AMZ_HOST = process.env.AMZ_HOST || "bedrock-runtime.%REGION%.amazonaws.com";
/**
 * Signs an outgoing AWS request with the appropriate headers modifies the
 * request object in place to fix the path.
 * This happens AFTER request transformation.
 */
const signAwsRequest = async (manager) => {
    const req = manager.request;
    const { model, stream } = req.body;
    const key = key_management_1.keyPool.get(model, "aws");
    manager.setKey(key);
    const credential = getCredentialParts(req);
    const host = AMZ_HOST.replace("%REGION%", credential.region);
    // AWS only uses 2023-06-01 and does not actually check this header, but we
    // set it so that the stream adapter always selects the correct transformer.
    manager.setHeader("anthropic-version", "2023-06-01");
    // If our key has an inference profile compatible with the requested model,
    // we want to use the inference profile instead of the model ID when calling
    // InvokeModel as that will give us higher rate limits.
    const profile = key.inferenceProfileIds.find((p) => p.includes(model)) || model;
    // Uses the AWS SDK to sign a request, then modifies our HPM proxy request
    // with the headers generated by the SDK.
    const newRequest = new protocol_http_1.HttpRequest({
        method: "POST",
        protocol: "https:",
        hostname: host,
        path: `/model/${profile}/invoke${stream ? "-with-response-stream" : ""}`,
        headers: {
            ["Host"]: host,
            ["content-type"]: "application/json",
        },
        body: JSON.stringify(getStrictlyValidatedBodyForAws(req)),
    });
    if (stream) {
        newRequest.headers["x-amzn-bedrock-accept"] = "application/json";
    }
    else {
        newRequest.headers["accept"] = "*/*";
    }
    const { body, inboundApi, outboundApi } = req;
    req.log.info({ key: key.hash, model: body.model, profile, inboundApi, outboundApi }, "Assigned AWS credentials to request");
    manager.setSignedRequest(await sign(newRequest, getCredentialParts(req)));
};
exports.signAwsRequest = signAwsRequest;
function getCredentialParts(req) {
    const [accessKeyId, secretAccessKey, region] = req.key.key.split(":");
    if (!accessKeyId || !secretAccessKey || !region) {
        req.log.error({ key: req.key.hash }, "AWS_CREDENTIALS isn't correctly formatted; refer to the docs");
        throw new Error("The key assigned to this request is invalid.");
    }
    return { accessKeyId, secretAccessKey, region };
}
async function sign(request, credential) {
    const { accessKeyId, secretAccessKey, region } = credential;
    const signer = new signature_v4_1.SignatureV4({
        sha256: sha256_js_1.Sha256,
        credentials: { accessKeyId, secretAccessKey },
        region,
        service: "bedrock",
    });
    return signer.sign(request);
}
function getStrictlyValidatedBodyForAws(req) {
    // AWS uses vendor API formats but imposes additional (more strict) validation
    // rules, namely that extraneous parameters are not allowed. We will validate
    // using the vendor's zod schema but apply `.strip` to ensure that any
    // extraneous parameters are removed.
    let strippedParams = {};
    switch (req.outboundApi) {
        case "anthropic-text":
            strippedParams = api_schemas_1.AnthropicV1TextSchema.pick({
                prompt: true,
                max_tokens_to_sample: true,
                stop_sequences: true,
                temperature: true,
                top_k: true,
                top_p: true,
            })
                .strip()
                .parse(req.body);
            break;
        case "anthropic-chat":
            strippedParams = api_schemas_1.AnthropicV1MessagesSchema.pick({
                messages: true,
                system: true,
                max_tokens: true,
                stop_sequences: true,
                temperature: true,
                top_k: true,
                top_p: true,
            })
                .strip()
                .parse(req.body);
            strippedParams.anthropic_version = "bedrock-2023-05-31";
            break;
        case "mistral-ai":
            strippedParams = mistral_ai_1.AWSMistralV1ChatCompletionsSchema.parse(req.body);
            break;
        case "mistral-text":
            strippedParams = mistral_ai_1.AWSMistralV1TextCompletionsSchema.parse(req.body);
            break;
        default:
            throw new Error("Unexpected outbound API for AWS.");
    }
    return strippedParams;
}
//# sourceMappingURL=sign-aws-request.js.map
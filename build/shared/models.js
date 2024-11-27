"use strict";
// Don't import any other project files here as this is one of the first modules
// loaded and it will cause circular imports.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelFamilyForRequest = exports.assertIsKnownModelFamily = exports.getAzureOpenAIModelFamily = exports.getGcpModelFamily = exports.getAwsBedrockModelFamily = exports.getMistralAIModelFamily = exports.getGoogleAIModelFamily = exports.getClaudeModelFamily = exports.getOpenAIModelFamily = exports.OPENAI_MODEL_FAMILY_MAP = exports.IMAGE_GEN_MODELS = exports.MODEL_FAMILY_SERVICE = exports.LLM_SERVICES = exports.MODEL_FAMILIES = void 0;
exports.MODEL_FAMILIES = ((arr) => arr)([
    "turbo",
    "gpt4",
    "gpt4-32k",
    "gpt4-turbo",
    "gpt4o",
    "o1",
    "o1-mini",
    "dall-e",
    "claude",
    "claude-opus",
    "gemini-flash",
    "gemini-pro",
    "gemini-ultra",
    "mistral-tiny",
    "mistral-small",
    "mistral-medium",
    "mistral-large",
    "aws-claude",
    "aws-claude-opus",
    "aws-mistral-tiny",
    "aws-mistral-small",
    "aws-mistral-medium",
    "aws-mistral-large",
    "gcp-claude",
    "gcp-claude-opus",
    "azure-turbo",
    "azure-gpt4",
    "azure-gpt4-32k",
    "azure-gpt4-turbo",
    "azure-gpt4o",
    "azure-dall-e",
    "azure-o1",
    "azure-o1-mini",
]);
exports.LLM_SERVICES = ((arr) => arr)([
    "openai",
    "anthropic",
    "google-ai",
    "mistral-ai",
    "aws",
    "gcp",
    "azure",
]);
exports.MODEL_FAMILY_SERVICE = {
    turbo: "openai",
    gpt4: "openai",
    "gpt4-turbo": "openai",
    "gpt4-32k": "openai",
    gpt4o: "openai",
    "o1": "openai",
    "o1-mini": "openai",
    "dall-e": "openai",
    claude: "anthropic",
    "claude-opus": "anthropic",
    "aws-claude": "aws",
    "aws-claude-opus": "aws",
    "aws-mistral-tiny": "aws",
    "aws-mistral-small": "aws",
    "aws-mistral-medium": "aws",
    "aws-mistral-large": "aws",
    "gcp-claude": "gcp",
    "gcp-claude-opus": "gcp",
    "azure-turbo": "azure",
    "azure-gpt4": "azure",
    "azure-gpt4-32k": "azure",
    "azure-gpt4-turbo": "azure",
    "azure-gpt4o": "azure",
    "azure-dall-e": "azure",
    "azure-o1": "azure",
    "azure-o1-mini": "azure",
    "gemini-flash": "google-ai",
    "gemini-pro": "google-ai",
    "gemini-ultra": "google-ai",
    "mistral-tiny": "mistral-ai",
    "mistral-small": "mistral-ai",
    "mistral-medium": "mistral-ai",
    "mistral-large": "mistral-ai",
};
exports.IMAGE_GEN_MODELS = ["dall-e", "azure-dall-e"];
exports.OPENAI_MODEL_FAMILY_MAP = {
    "^gpt-4o(-\\d{4}-\\d{2}-\\d{2})?$": "gpt4o",
    "^chatgpt-4o": "gpt4o",
    "^gpt-4o-mini(-\\d{4}-\\d{2}-\\d{2})?$": "turbo", // closest match
    "^gpt-4-turbo(-\\d{4}-\\d{2}-\\d{2})?$": "gpt4-turbo",
    "^gpt-4-turbo(-preview)?$": "gpt4-turbo",
    "^gpt-4-(0125|1106)(-preview)?$": "gpt4-turbo",
    "^gpt-4(-\\d{4})?-vision(-preview)?$": "gpt4-turbo",
    "^gpt-4-32k-\\d{4}$": "gpt4-32k",
    "^gpt-4-32k$": "gpt4-32k",
    "^gpt-4-\\d{4}$": "gpt4",
    "^gpt-4$": "gpt4",
    "^gpt-3.5-turbo": "turbo",
    "^text-embedding-ada-002$": "turbo",
    "^dall-e-\\d{1}$": "dall-e",
    "^o1-mini(-\\d{4}-\\d{2}-\\d{2})?$": "o1-mini",
    "^o1(-preview)?(-\\d{4}-\\d{2}-\\d{2})?$": "o1",
};
function getOpenAIModelFamily(model, defaultFamily = "gpt4") {
    for (const [regex, family] of Object.entries(exports.OPENAI_MODEL_FAMILY_MAP)) {
        if (model.match(regex))
            return family;
    }
    return defaultFamily;
}
exports.getOpenAIModelFamily = getOpenAIModelFamily;
function getClaudeModelFamily(model) {
    if (model.includes("opus"))
        return "claude-opus";
    return "claude";
}
exports.getClaudeModelFamily = getClaudeModelFamily;
function getGoogleAIModelFamily(model) {
    return model.includes("ultra")
        ? "gemini-ultra"
        : model.includes("flash")
            ? "gemini-flash"
            : "gemini-pro";
}
exports.getGoogleAIModelFamily = getGoogleAIModelFamily;
function getMistralAIModelFamily(model) {
    const prunedModel = model.replace(/-(latest|\d{4})$/, "");
    switch (prunedModel) {
        case "mistral-tiny":
        case "mistral-small":
        case "mistral-medium":
        case "mistral-large":
            return prunedModel;
        case "open-mistral-7b":
            return "mistral-tiny";
        case "open-mistral-nemo":
        case "open-mixtral-8x7b":
        case "codestral":
        case "open-codestral-mamba":
            return "mistral-small";
        case "open-mixtral-8x22b":
            return "mistral-medium";
        default:
            return "mistral-small";
    }
}
exports.getMistralAIModelFamily = getMistralAIModelFamily;
function getAwsBedrockModelFamily(model) {
    // remove vendor and version from AWS model ids
    // 'anthropic.claude-3-5-sonnet-20240620-v1:0' -> 'claude-3-5-sonnet-20240620'
    const deAwsified = model.replace(/^(\w+)\.(.+?)(-v\d+)?(:\d+)*$/, "$2");
    if (["claude", "anthropic"].some((x) => model.includes(x))) {
        return `aws-${getClaudeModelFamily(deAwsified)}`;
    }
    else if (model.includes("tral")) {
        return `aws-${getMistralAIModelFamily(deAwsified)}`;
    }
    return `aws-claude`;
}
exports.getAwsBedrockModelFamily = getAwsBedrockModelFamily;
function getGcpModelFamily(model) {
    if (model.includes("opus"))
        return "gcp-claude-opus";
    return "gcp-claude";
}
exports.getGcpModelFamily = getGcpModelFamily;
function getAzureOpenAIModelFamily(model, defaultFamily = "azure-gpt4") {
    // Azure model names omit periods.  addAzureKey also prepends "azure-" to the
    // model name to route the request the correct keyprovider, so we need to
    // remove that as well.
    const modified = model
        .replace("gpt-35-turbo", "gpt-3.5-turbo")
        .replace("azure-", "");
    for (const [regex, family] of Object.entries(exports.OPENAI_MODEL_FAMILY_MAP)) {
        if (modified.match(regex)) {
            return `azure-${family}`;
        }
    }
    return defaultFamily;
}
exports.getAzureOpenAIModelFamily = getAzureOpenAIModelFamily;
function assertIsKnownModelFamily(modelFamily) {
    if (!exports.MODEL_FAMILIES.includes(modelFamily)) {
        throw new Error(`Unknown model family: ${modelFamily}`);
    }
}
exports.assertIsKnownModelFamily = assertIsKnownModelFamily;
function getModelFamilyForRequest(req) {
    if (req.modelFamily)
        return req.modelFamily;
    // There is a single request queue, but it is partitioned by model family.
    // Model families are typically separated on cost/rate limit boundaries so
    // they should be treated as separate queues.
    const model = req.body.model ?? "gpt-3.5-turbo";
    let modelFamily;
    // Weird special case for AWS/GCP/Azure because they serve models with
    // different API formats, so the outbound API alone is not sufficient to
    // determine the partition.
    if (req.service === "aws") {
        modelFamily = getAwsBedrockModelFamily(model);
    }
    else if (req.service === "gcp") {
        modelFamily = getGcpModelFamily(model);
    }
    else if (req.service === "azure") {
        modelFamily = getAzureOpenAIModelFamily(model);
    }
    else {
        switch (req.outboundApi) {
            case "anthropic-chat":
            case "anthropic-text":
                modelFamily = getClaudeModelFamily(model);
                break;
            case "openai":
            case "openai-text":
            case "openai-image":
                modelFamily = getOpenAIModelFamily(model);
                break;
            case "google-ai":
                modelFamily = getGoogleAIModelFamily(model);
                break;
            case "mistral-ai":
            case "mistral-text":
                modelFamily = getMistralAIModelFamily(model);
                break;
            default:
                assertNever(req.outboundApi);
        }
    }
    return (req.modelFamily = modelFamily);
}
exports.getModelFamilyForRequest = getModelFamilyForRequest;
function assertNever(x) {
    throw new Error(`Called assertNever with argument ${x}.`);
}
//# sourceMappingURL=models.js.map
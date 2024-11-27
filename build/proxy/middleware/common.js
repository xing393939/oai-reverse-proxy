"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelFromBody = exports.getCompletionFromBody = exports.classifyErrorAndSend = exports.sendProxyError = exports.isEmbeddingsRequest = exports.isImageGenerationRequest = exports.isTextGenerationRequest = void 0;
const http_1 = __importDefault(require("http"));
const net_1 = require("net");
const zod_error_1 = require("zod-error");
const utils_1 = require("../../shared/utils");
const error_generator_1 = require("./response/error-generator");
const OPENAI_CHAT_COMPLETION_ENDPOINT = "/v1/chat/completions";
const OPENAI_TEXT_COMPLETION_ENDPOINT = "/v1/completions";
const OPENAI_EMBEDDINGS_ENDPOINT = "/v1/embeddings";
const OPENAI_IMAGE_COMPLETION_ENDPOINT = "/v1/images/generations";
const ANTHROPIC_COMPLETION_ENDPOINT = "/v1/complete";
const ANTHROPIC_MESSAGES_ENDPOINT = "/v1/messages";
const ANTHROPIC_SONNET_COMPAT_ENDPOINT = "/v1/sonnet";
const ANTHROPIC_OPUS_COMPAT_ENDPOINT = "/v1/opus";
const GOOGLE_AI_COMPLETION_ENDPOINT = "/v1beta/models";
function isTextGenerationRequest(req) {
    return (req.method === "POST" &&
        [
            OPENAI_CHAT_COMPLETION_ENDPOINT,
            OPENAI_TEXT_COMPLETION_ENDPOINT,
            ANTHROPIC_COMPLETION_ENDPOINT,
            ANTHROPIC_MESSAGES_ENDPOINT,
            ANTHROPIC_SONNET_COMPAT_ENDPOINT,
            ANTHROPIC_OPUS_COMPAT_ENDPOINT,
            GOOGLE_AI_COMPLETION_ENDPOINT,
        ].some((endpoint) => req.path.startsWith(endpoint)));
}
exports.isTextGenerationRequest = isTextGenerationRequest;
function isImageGenerationRequest(req) {
    return (req.method === "POST" &&
        req.path.startsWith(OPENAI_IMAGE_COMPLETION_ENDPOINT));
}
exports.isImageGenerationRequest = isImageGenerationRequest;
function isEmbeddingsRequest(req) {
    return (req.method === "POST" && req.path.startsWith(OPENAI_EMBEDDINGS_ENDPOINT));
}
exports.isEmbeddingsRequest = isEmbeddingsRequest;
function sendProxyError(req, res, statusCode, statusMessage, errorPayload) {
    const msg = statusCode === 500
        ? `The proxy encountered an error while trying to process your prompt.`
        : `The proxy encountered an error while trying to send your prompt to the API.`;
    (0, error_generator_1.sendErrorToClient)({
        options: {
            format: req.inboundApi,
            title: `Proxy error (HTTP ${statusCode} ${statusMessage})`,
            message: `${msg} Further details are provided below.`,
            obj: errorPayload,
            reqId: req.id,
            model: req.body?.model,
        },
        req,
        res,
    });
}
exports.sendProxyError = sendProxyError;
/**
 * Handles errors thrown during preparation of a proxy request (before it is
 * sent to the upstream API), typically due to validation, quota, or other
 * pre-flight checks. Depending on the error class, this function will send an
 * appropriate error response to the client, streaming it if necessary.
 */
const classifyErrorAndSend = (err, req, res) => {
    if (res instanceof net_1.Socket) {
        // We should always have an Express response object here, but http-proxy's
        // ErrorCallback type says it could be just a Socket.
        req.log.error(err, "Caught error while proxying request to target but cannot send error response to client.");
        return res.destroy();
    }
    try {
        const { statusCode, statusMessage, userMessage, ...errorDetails } = classifyError(err);
        sendProxyError(req, res, statusCode, statusMessage, {
            error: { message: userMessage, ...errorDetails },
        });
    }
    catch (error) {
        req.log.error(error, `Error writing error response headers, giving up.`);
        res.end();
    }
};
exports.classifyErrorAndSend = classifyErrorAndSend;
function classifyError(err) {
    const defaultError = {
        statusCode: 500,
        statusMessage: "Internal Server Error",
        userMessage: `Reverse proxy error: ${err.message}`,
        type: "proxy_internal_error",
        stack: err.stack,
    };
    switch (err.constructor.name) {
        case "HttpError":
            const statusCode = err.status;
            return {
                statusCode,
                statusMessage: `HTTP ${statusCode} ${http_1.default.STATUS_CODES[statusCode]}`,
                userMessage: `Reverse proxy error: ${err.message}`,
                type: "proxy_http_error",
            };
        case "BadRequestError":
            return {
                statusCode: 400,
                statusMessage: "Bad Request",
                userMessage: `Request is not valid. (${err.message})`,
                type: "proxy_bad_request",
            };
        case "NotFoundError":
            return {
                statusCode: 404,
                statusMessage: "Not Found",
                userMessage: `Requested resource not found. (${err.message})`,
                type: "proxy_not_found",
            };
        case "PaymentRequiredError":
            return {
                statusCode: 402,
                statusMessage: "No Keys Available",
                userMessage: err.message,
                type: "proxy_no_keys_available",
            };
        case "ZodError":
            const userMessage = (0, zod_error_1.generateErrorMessage)(err.issues, {
                prefix: "Request validation failed. ",
                path: { enabled: true, label: null, type: "breadcrumbs" },
                code: { enabled: false },
                maxErrors: 3,
                transform: ({ issue, ...rest }) => {
                    return `At '${rest.pathComponent}': ${issue.message}`;
                },
            });
            return {
                statusCode: 400,
                statusMessage: "Bad Request",
                userMessage,
                type: "proxy_validation_error",
            };
        case "ZoomerForbiddenError":
            // Mimics a ban notice from OpenAI, thrown when blockZoomerOrigins blocks
            // a request.
            return {
                statusCode: 403,
                statusMessage: "Forbidden",
                userMessage: `Your account has been disabled for violating our terms of service.`,
                type: "organization_account_disabled",
                code: "policy_violation",
            };
        case "ForbiddenError":
            return {
                statusCode: 403,
                statusMessage: "Forbidden",
                userMessage: `Request is not allowed. (${err.message})`,
                type: "proxy_forbidden",
            };
        case "QuotaExceededError":
            return {
                statusCode: 429,
                statusMessage: "Too Many Requests",
                userMessage: `You've exceeded your token quota for this model type.`,
                type: "proxy_quota_exceeded",
                info: err.quotaInfo,
            };
        case "Error":
            if ("code" in err) {
                switch (err.code) {
                    case "ENOTFOUND":
                        return {
                            statusCode: 502,
                            statusMessage: "Bad Gateway",
                            userMessage: `Reverse proxy encountered a DNS error while trying to connect to the upstream service.`,
                            type: "proxy_network_error",
                            code: err.code,
                        };
                    case "ECONNREFUSED":
                        return {
                            statusCode: 502,
                            statusMessage: "Bad Gateway",
                            userMessage: `Reverse proxy couldn't connect to the upstream service.`,
                            type: "proxy_network_error",
                            code: err.code,
                        };
                    case "ECONNRESET":
                        return {
                            statusCode: 504,
                            statusMessage: "Gateway Timeout",
                            userMessage: `Reverse proxy timed out while waiting for the upstream service to respond.`,
                            type: "proxy_network_error",
                            code: err.code,
                        };
                }
            }
            return defaultError;
        default:
            return defaultError;
    }
}
function getCompletionFromBody(req, body) {
    const format = req.outboundApi;
    switch (format) {
        case "openai":
        case "mistral-ai":
            // Few possible values:
            // - choices[0].message.content
            // - choices[0].message with no content if model is invoking a tool
            return body.choices?.[0]?.message?.content || "";
        case "mistral-text":
            return body.outputs?.[0]?.text || "";
        case "openai-text":
            return body.choices[0].text;
        case "anthropic-chat":
            if (!body.content) {
                req.log.error({ body: JSON.stringify(body) }, "Received empty Anthropic chat completion");
                return "";
            }
            return body.content
                .map(({ text, type }) => type === "text" ? text : `[Unsupported content type: ${type}]`)
                .join("\n");
        case "anthropic-text":
            if (!body.completion) {
                req.log.error({ body: JSON.stringify(body) }, "Received empty Anthropic text completion");
                return "";
            }
            return body.completion.trim();
        case "google-ai":
            if ("choices" in body) {
                return body.choices[0].message.content;
            }
            return body.candidates[0].content.parts[0].text;
        case "openai-image":
            return body.data?.map((item) => item.url).join("\n");
        default:
            (0, utils_1.assertNever)(format);
    }
}
exports.getCompletionFromBody = getCompletionFromBody;
function getModelFromBody(req, resBody) {
    const format = req.outboundApi;
    switch (format) {
        case "openai":
        case "openai-text":
            return resBody.model;
        case "mistral-ai":
        case "mistral-text":
        case "openai-image":
        case "google-ai":
            // These formats don't have a model in the response body.
            return req.body.model;
        case "anthropic-chat":
        case "anthropic-text":
            // Anthropic confirms the model in the response, but AWS Claude doesn't.
            return resBody.model || req.body.model;
        default:
            (0, utils_1.assertNever)(format);
    }
}
exports.getModelFromBody = getModelFromBody;
//# sourceMappingURL=common.js.map
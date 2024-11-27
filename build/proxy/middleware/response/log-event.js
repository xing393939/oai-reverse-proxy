"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = void 0;
const crypto_1 = require("crypto");
const config_1 = require("../../../config");
const prompt_logging_1 = require("../../../shared/prompt-logging");
const common_1 = require("../common");
/** If event logging is enabled, logs a chat completion event. */
const logEvent = async (_proxyRes, req, _res, responseBody) => {
    if (!config_1.config.eventLogging) {
        return;
    }
    if (typeof responseBody !== "object") {
        throw new Error("Expected body to be an object");
    }
    if (!["openai", "anthropic-chat"].includes(req.outboundApi)) {
        // only chat apis are supported
        return;
    }
    if (!req.user) {
        return;
    }
    const loggable = (0, common_1.isTextGenerationRequest)(req);
    if (!loggable)
        return;
    const messages = req.body.messages;
    let hashes = [];
    hashes.push(hashMessages(messages));
    for (let i = 1; i <= Math.min(config_1.config.eventLoggingTrim, messages.length); i++) {
        hashes.push(hashMessages(messages.slice(0, -i)));
    }
    const model = (0, common_1.getModelFromBody)(req, responseBody);
    const userToken = req.user.token;
    const family = req.modelFamily;
    prompt_logging_1.eventLogger.logEvent({
        ip: req.ip,
        type: "chat_completion",
        model,
        family,
        hashes,
        userToken,
        inputTokens: req.promptTokens ?? 0,
        outputTokens: req.outputTokens ?? 0,
    });
};
exports.logEvent = logEvent;
const hashMessages = (messages) => {
    let hasher = (0, crypto_1.createHash)("sha256");
    let messageTexts = [];
    for (const msg of messages) {
        if (!["system", "user", "assistant"].includes(msg.role))
            continue;
        if (typeof msg.content === "string") {
            messageTexts.push(msg.content);
        }
        else if (Array.isArray(msg.content)) {
            if (msg.content[0].type === "text") {
                messageTexts.push(msg.content[0].text);
            }
        }
    }
    hasher.update(messageTexts.join("<|im_sep|>"));
    return hasher.digest("hex");
};
//# sourceMappingURL=log-event.js.map
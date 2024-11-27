"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateVision = void 0;
const config_1 = require("../../../../config");
const utils_1 = require("../../../../shared/utils");
const openai_1 = require("../../../../shared/api-schemas/openai");
const anthropic_1 = require("../../../../shared/api-schemas/anthropic");
const errors_1 = require("../../../../shared/errors");
/**
 * Rejects prompts containing images if multimodal prompts are disabled.
 */
const validateVision = async (req) => {
    if (req.service === undefined) {
        throw new Error("Request service must be set before validateVision");
    }
    if (req.user?.type === "special")
        return;
    if (config_1.config.allowedVisionServices.includes(req.service))
        return;
    // vision not allowed for req's service, block prompts with images
    let hasImage = false;
    switch (req.outboundApi) {
        case "openai":
            hasImage = (0, openai_1.containsImageContent)(req.body.messages);
            break;
        case "anthropic-chat":
            hasImage = (0, anthropic_1.containsImageContent)(req.body.messages);
            break;
        case "anthropic-text":
        case "google-ai":
        case "mistral-ai":
        case "mistral-text":
        case "openai-image":
        case "openai-text":
            return;
        default:
            (0, utils_1.assertNever)(req.outboundApi);
    }
    if (hasImage) {
        throw new errors_1.ForbiddenError("Prompts containing images are not permitted. Disable 'Send Inline Images' in your client and try again.");
    }
};
exports.validateVision = validateVision;
//# sourceMappingURL=validate-vision.js.map
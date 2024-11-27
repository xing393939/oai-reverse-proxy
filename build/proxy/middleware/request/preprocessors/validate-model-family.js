"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateModelFamily = void 0;
const config_1 = require("../../../../config");
const errors_1 = require("../../../../shared/errors");
const models_1 = require("../../../../shared/models");
/**
 * Ensures the selected model family is enabled by the proxy configuration.
 */
const validateModelFamily = (req) => {
    const family = (0, models_1.getModelFamilyForRequest)(req);
    if (!config_1.config.allowedModelFamilies.includes(family)) {
        throw new errors_1.ForbiddenError(`Model family '${family}' is not enabled on this proxy`);
    }
};
exports.validateModelFamily = validateModelFamily;
//# sourceMappingURL=validate-model-family.js.map
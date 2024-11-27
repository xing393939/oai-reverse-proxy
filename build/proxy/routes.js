"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxyRouter = void 0;
const express_1 = __importDefault(require("express"));
const add_v1_1 = require("./add-v1");
const anthropic_1 = require("./anthropic");
const aws_1 = require("./aws");
const azure_1 = require("./azure");
const check_risu_token_1 = require("./check-risu-token");
const gatekeeper_1 = require("./gatekeeper");
const gcp_1 = require("./gcp");
const google_ai_1 = require("./google-ai");
const mistral_ai_1 = require("./mistral-ai");
const openai_1 = require("./openai");
const openai_image_1 = require("./openai-image");
const error_generator_1 = require("./middleware/response/error-generator");
const proxyRouter = express_1.default.Router();
exports.proxyRouter = proxyRouter;
// Remove `expect: 100-continue` header from requests due to incompatibility
// with node-http-proxy.
proxyRouter.use((req, _res, next) => {
    if (req.headers.expect) {
        delete req.headers.expect;
    }
    next();
});
// Apply body parsers.
proxyRouter.use(express_1.default.json({ limit: "100mb" }), express_1.default.urlencoded({ extended: true, limit: "100mb" }));
// Apply auth/rate limits.
proxyRouter.use(gatekeeper_1.gatekeeper);
proxyRouter.use(check_risu_token_1.checkRisuToken);
// Initialize request queue metadata.
proxyRouter.use((req, _res, next) => {
    req.startTime = Date.now();
    req.retryCount = 0;
    next();
});
// Proxy endpoints.
proxyRouter.use("/openai", add_v1_1.addV1, openai_1.openai);
proxyRouter.use("/openai-image", add_v1_1.addV1, openai_image_1.openaiImage);
proxyRouter.use("/anthropic", add_v1_1.addV1, anthropic_1.anthropic);
proxyRouter.use("/google-ai", add_v1_1.addV1, google_ai_1.googleAI);
proxyRouter.use("/mistral-ai", add_v1_1.addV1, mistral_ai_1.mistralAI);
proxyRouter.use("/aws", aws_1.aws);
proxyRouter.use("/gcp/claude", add_v1_1.addV1, gcp_1.gcp);
proxyRouter.use("/azure/openai", add_v1_1.addV1, azure_1.azure);
// Redirect browser requests to the homepage.
proxyRouter.get("*", (req, res, next) => {
    const isBrowser = req.headers["user-agent"]?.includes("Mozilla");
    if (isBrowser) {
        res.redirect("/");
    }
    else {
        next();
    }
});
// Send a fake client error if user specifies an invalid proxy endpoint.
proxyRouter.use((req, res) => {
    (0, error_generator_1.sendErrorToClient)({
        req,
        res,
        options: {
            title: "Proxy error (HTTP 404 Not Found)",
            message: "The requested proxy endpoint does not exist.",
            model: req.body?.model,
            reqId: req.id,
            format: "unknown",
            obj: {
                proxy_note: "Your chat client is using the wrong endpoint. Check the Service Info page for the list of available endpoints.",
                requested_url: req.originalUrl,
            },
        },
    });
});
//# sourceMappingURL=routes.js.map
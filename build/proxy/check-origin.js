"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkOrigin = void 0;
const config_1 = require("../config");
const BLOCKED_REFERERS = config_1.config.blockedOrigins?.split(",") || [];
/** Disallow requests from blocked origins and referers. */
const checkOrigin = (req, res, next) => {
    const blocks = BLOCKED_REFERERS || [];
    for (const block of blocks) {
        if (req.headers.origin?.includes(block) ||
            req.headers.referer?.includes(block)) {
            req.log.warn({ origin: req.headers.origin, referer: req.headers.referer }, "Blocked request from origin or referer");
            // VenusAI requests incorrectly say they accept HTML despite immediately
            // trying to parse the response as JSON, so we check the body type instead
            const hasJsonBody = req.headers["content-type"]?.includes("application/json");
            if (!req.accepts("html") || hasJsonBody) {
                return res.status(403).json({
                    error: { type: "blocked_origin", message: config_1.config.blockMessage },
                });
            }
            else {
                const destination = config_1.config.blockRedirect || "https://openai.com";
                return res.status(403).send(`<html>
<head>
  <title>Redirecting</title>
  <meta http-equiv="refresh" content="3; url=${destination}" />
</head>
<body style="font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; justify-content: center; text-align: center;">
<h2>${config_1.config.blockMessage}</h3>
<p><strong>Please hold while you are redirected to a more suitable service.</strong></p>
</body>
</html>`);
            }
        }
    }
    next();
};
exports.checkOrigin = checkOrigin;
//# sourceMappingURL=check-origin.js.map
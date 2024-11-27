"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.infoPageRouter = exports.renderPage = exports.handleInfoPage = void 0;
/** This whole module kinda sucks */
const fs_1 = __importDefault(require("fs"));
const express_1 = __importStar(require("express"));
const showdown_1 = __importDefault(require("showdown"));
const config_1 = require("./config");
const service_info_1 = require("./service-info");
const image_history_1 = require("./shared/file-storage/image-history");
const key_management_1 = require("./shared/key-management");
const models_1 = require("./shared/models");
const with_session_1 = require("./shared/with-session");
const inject_csrf_1 = require("./shared/inject-csrf");
const INFO_PAGE_TTL = 2000;
const MODEL_FAMILY_FRIENDLY_NAME = {
    turbo: "GPT-4o Mini / 3.5 Turbo",
    gpt4: "GPT-4",
    "gpt4-32k": "GPT-4 32k",
    "gpt4-turbo": "GPT-4 Turbo",
    gpt4o: "GPT-4o",
    o1: "OpenAI o1",
    "o1-mini": "OpenAI o1 mini",
    "dall-e": "DALL-E",
    claude: "Claude (Sonnet)",
    "claude-opus": "Claude (Opus)",
    "gemini-flash": "Gemini Flash",
    "gemini-pro": "Gemini Pro",
    "gemini-ultra": "Gemini Ultra",
    "mistral-tiny": "Mistral 7B",
    "mistral-small": "Mistral Nemo",
    "mistral-medium": "Mistral Medium",
    "mistral-large": "Mistral Large",
    "aws-claude": "AWS Claude (Sonnet)",
    "aws-claude-opus": "AWS Claude (Opus)",
    "aws-mistral-tiny": "AWS Mistral 7B",
    "aws-mistral-small": "AWS Mistral Nemo",
    "aws-mistral-medium": "AWS Mistral Medium",
    "aws-mistral-large": "AWS Mistral Large",
    "gcp-claude": "GCP Claude (Sonnet)",
    "gcp-claude-opus": "GCP Claude (Opus)",
    "azure-turbo": "Azure GPT-3.5 Turbo",
    "azure-gpt4": "Azure GPT-4",
    "azure-gpt4-32k": "Azure GPT-4 32k",
    "azure-gpt4-turbo": "Azure GPT-4 Turbo",
    "azure-gpt4o": "Azure GPT-4o",
    "azure-o1": "Azure o1",
    "azure-o1-mini": "Azure o1 mini",
    "azure-dall-e": "Azure DALL-E",
};
const converter = new showdown_1.default.Converter();
const customGreeting = fs_1.default.existsSync("greeting.md")
    ? `<div id="servergreeting">${fs_1.default.readFileSync("greeting.md", "utf8")}</div>`
    : "";
let infoPageHtml;
let infoPageLastUpdated = 0;
const handleInfoPage = (req, res) => {
    if (infoPageLastUpdated + INFO_PAGE_TTL > Date.now()) {
        return res.send(infoPageHtml);
    }
    const baseUrl = process.env.SPACE_ID && !req.get("host")?.includes("hf.space")
        ? getExternalUrlForHuggingfaceSpaceId(process.env.SPACE_ID)
        : req.protocol + "://" + req.get("host");
    const info = (0, service_info_1.buildInfo)(baseUrl + config_1.config.proxyEndpointRoute);
    infoPageHtml = renderPage(info);
    infoPageLastUpdated = Date.now();
    res.send(infoPageHtml);
};
exports.handleInfoPage = handleInfoPage;
function renderPage(info) {
    const title = getServerTitle();
    const headerHtml = buildInfoPageHeader(info);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
    <link rel="stylesheet" href="/res/css/reset.css" media="screen" />
    <link rel="stylesheet" href="/res/css/sakura.css" media="screen" />
    <link rel="stylesheet" href="/res/css/sakura-dark.css" media="screen and (prefers-color-scheme: dark)" />
    <style>
      body {
        font-family: sans-serif;
        padding: 1em;
        max-width: 900px;
        margin: 0;
      }
      
      .self-service-links {
        display: flex;
        justify-content: center;
        margin-bottom: 1em;
        padding: 0.5em;
        font-size: 0.8em;
      }
      
      .self-service-links a {
        margin: 0 0.5em;
      }
    </style>
  </head>
  <body>
    ${headerHtml}
    <hr />
    ${getSelfServiceLinks()}
    <h2>Service Info</h2>
    <pre>${JSON.stringify(info, null, 2)}</pre>
  </body>
</html>`;
}
exports.renderPage = renderPage;
/**
 * If the server operator provides a `greeting.md` file, it will be included in
 * the rendered info page.
 **/
function buildInfoPageHeader(info) {
    const title = getServerTitle();
    // TODO: use some templating engine instead of this mess
    let infoBody = `# ${title}`;
    if (config_1.config.promptLogging) {
        infoBody += `\n## Prompt Logging Enabled
This proxy keeps full logs of all prompts and AI responses. Prompt logs are anonymous and do not contain IP addresses or timestamps.

[You can see the type of data logged here, along with the rest of the code.](https://gitgud.io/khanon/oai-reverse-proxy/-/blob/main/src/shared/prompt-logging/index.ts).

**If you are uncomfortable with this, don't send prompts to this proxy!**`;
    }
    if (config_1.config.staticServiceInfo) {
        return converter.makeHtml(infoBody + customGreeting);
    }
    const waits = [];
    for (const modelFamily of config_1.config.allowedModelFamilies) {
        const service = models_1.MODEL_FAMILY_SERVICE[modelFamily];
        const hasKeys = key_management_1.keyPool.list().some((k) => {
            return k.service === service && k.modelFamilies.includes(modelFamily);
        });
        const wait = info[modelFamily]?.estimatedQueueTime;
        if (hasKeys && wait) {
            waits.push(`**${MODEL_FAMILY_FRIENDLY_NAME[modelFamily] || modelFamily}**: ${wait}`);
        }
    }
    infoBody += "\n\n" + waits.join(" / ");
    infoBody += customGreeting;
    infoBody += buildRecentImageSection();
    return converter.makeHtml(infoBody);
}
function getSelfServiceLinks() {
    if (config_1.config.gatekeeper !== "user_token")
        return "";
    const links = [["Check your user token", "/user/lookup"]];
    if (config_1.config.captchaMode !== "none") {
        links.unshift(["Request a user token", "/user/captcha"]);
    }
    return `<div class="self-service-links">${links
        .map(([text, link]) => `<a href="${link}">${text}</a>`)
        .join(" | ")}</div>`;
}
function getServerTitle() {
    // Use manually set title if available
    if (process.env.SERVER_TITLE) {
        return process.env.SERVER_TITLE;
    }
    // Huggingface
    if (process.env.SPACE_ID) {
        return `${process.env.SPACE_AUTHOR_NAME} / ${process.env.SPACE_TITLE}`;
    }
    // Render
    if (process.env.RENDER) {
        return `Render / ${process.env.RENDER_SERVICE_NAME}`;
    }
    return "OAI Reverse Proxy";
}
function buildRecentImageSection() {
    const dalleModels = ["azure-dall-e", "dall-e"];
    if (!config_1.config.showRecentImages ||
        dalleModels.every((f) => !config_1.config.allowedModelFamilies.includes(f))) {
        return "";
    }
    let html = `<h2>Recent DALL-E Generations</h2>`;
    const recentImages = (0, image_history_1.getLastNImages)(12).reverse();
    if (recentImages.length === 0) {
        html += `<p>No images yet.</p>`;
        return html;
    }
    html += `<div style="display: flex; flex-wrap: wrap;" id="recent-images">`;
    for (const { url, prompt } of recentImages) {
        const thumbUrl = url.replace(/\.png$/, "_t.jpg");
        const escapedPrompt = escapeHtml(prompt);
        html += `<div style="margin: 0.5em;" class="recent-image">
<a href="${url}" target="_blank"><img src="${thumbUrl}" title="${escapedPrompt}" alt="${escapedPrompt}" style="max-width: 150px; max-height: 150px;" /></a>
</div>`;
    }
    html += `</div>`;
    html += `<p style="clear: both; text-align: center;"><a href="/user/image-history">View all recent images</a></p>`;
    return html;
}
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/\[/g, "&#91;")
        .replace(/]/g, "&#93;");
}
function getExternalUrlForHuggingfaceSpaceId(spaceId) {
    try {
        const [username, spacename] = spaceId.split("/");
        return `https://${username}-${spacename.replace(/_/g, "-")}.hf.space`;
    }
    catch (e) {
        return "";
    }
}
function checkIfUnlocked(req, res, next) {
    if (config_1.config.serviceInfoPassword?.length && !req.session?.unlocked) {
        return res.redirect("/unlock-info");
    }
    next();
}
const infoPageRouter = (0, express_1.Router)();
exports.infoPageRouter = infoPageRouter;
if (config_1.config.serviceInfoPassword?.length) {
    infoPageRouter.use(express_1.default.json({ limit: "1mb" }), express_1.default.urlencoded({ extended: true, limit: "1mb" }));
    infoPageRouter.use(with_session_1.withSession);
    infoPageRouter.use(inject_csrf_1.injectCsrfToken, inject_csrf_1.checkCsrfToken);
    infoPageRouter.post("/unlock-info", (req, res) => {
        if (req.body.password !== config_1.config.serviceInfoPassword) {
            return res.status(403).send("Incorrect password");
        }
        req.session.unlocked = true;
        res.redirect("/");
    });
    infoPageRouter.get("/unlock-info", (_req, res) => {
        if (_req.session?.unlocked)
            return res.redirect("/");
        res.send(`
      <form method="post" action="/unlock-info">
        <h1>Unlock Service Info</h1>
        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}" />
        <input type="password" name="password" placeholder="Password" />
        <button type="submit">Unlock</button>
      </form>
    `);
    });
    infoPageRouter.use(checkIfUnlocked);
}
infoPageRouter.get("/", exports.handleInfoPage);
infoPageRouter.get("/status", (req, res) => {
    res.json((0, service_info_1.buildInfo)(req.protocol + "://" + req.get("host"), false));
});
//# sourceMappingURL=info-page.js.map
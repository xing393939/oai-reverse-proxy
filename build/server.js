"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
require("source-map-support/register");
const check_disk_space_1 = __importDefault(require("check-disk-space"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const pino_http_1 = __importDefault(require("pino-http"));
const os_1 = __importDefault(require("os"));
const child_process_1 = __importDefault(require("child_process"));
const logger_1 = require("./logger");
const cidr_1 = require("./shared/cidr");
const setup_assets_dir_1 = require("./shared/file-storage/setup-assets-dir");
const key_management_1 = require("./shared/key-management");
const routes_1 = require("./admin/routes");
const routes_2 = require("./proxy/routes");
const info_page_1 = require("./info-page");
const models_1 = require("./shared/models");
const routes_3 = require("./user/routes");
const prompt_logging_1 = require("./shared/prompt-logging");
const queue_1 = require("./proxy/queue");
const user_store_1 = require("./shared/users/user-store");
const tokenization_1 = require("./shared/tokenization");
const check_origin_1 = require("./proxy/check-origin");
const error_generator_1 = require("./proxy/middleware/response/error-generator");
const database_1 = require("./shared/database");
const firebase_1 = require("./shared/firebase");
const PORT = config_1.config.port;
const BIND_ADDRESS = config_1.config.bindAddress;
const app = (0, express_1.default)();
// middleware
app.use((0, pino_http_1.default)({
    quietReqLogger: true,
    logger: logger_1.logger,
    autoLogging: {
        ignore: ({ url }) => {
            const ignoreList = ["/health", "/res", "/user_content"];
            return ignoreList.some((path) => url.startsWith(path));
        },
    },
    redact: {
        paths: [
            "req.headers.cookie",
            'res.headers["set-cookie"]',
            "req.headers.authorization",
            'req.headers["x-api-key"]',
            'req.headers["api-key"]',
            // Don't log the prompt text on transform errors
            "body.messages",
            "body.prompt",
            "body.contents",
        ],
        censor: "********",
    },
    customProps: (req) => {
        const user = req.user;
        if (user)
            return { userToken: `...${user.token.slice(-5)}` };
        return {};
    },
}));
app.set("trust proxy", Number(config_1.config.trustedProxies));
app.set("view engine", "ejs");
app.set("views", [
    path_1.default.join(__dirname, "admin/web/views"),
    path_1.default.join(__dirname, "user/web/views"),
    path_1.default.join(__dirname, "shared/views"),
]);
app.use("/user_content", express_1.default.static(config_1.USER_ASSETS_DIR, { maxAge: "2h" }));
app.use("/res", express_1.default.static(path_1.default.join(__dirname, "..", "public"), {
    maxAge: "2h",
    etag: false,
}));
app.get("/health", (_req, res) => res.sendStatus(200));
app.use((0, cors_1.default)());
const blacklist = (0, cidr_1.createBlacklistMiddleware)("IP_BLACKLIST", config_1.config.ipBlacklist);
app.use(blacklist);
app.use(check_origin_1.checkOrigin);
app.use("/admin", routes_1.adminRouter);
app.use((req, _, next) => {
    // For whatever reason SillyTavern just ignores the path a user provides
    // when using Google AI with reverse proxy.  We'll fix it here.
    if (req.path.startsWith("/v1beta/models/")) {
        req.url = `${config_1.config.proxyEndpointRoute}/google-ai${req.url}`;
        return next();
    }
    next();
});
app.use(config_1.config.proxyEndpointRoute, routes_2.proxyRouter);
app.use("/user", routes_3.userRouter);
if (config_1.config.staticServiceInfo) {
    app.get("/", (_req, res) => res.sendStatus(200));
}
else {
    app.use("/", info_page_1.infoPageRouter);
}
app.use((err, req, res, _next) => {
    if (!err.status) {
        logger_1.logger.error(err, "Unhandled error in request");
    }
    (0, error_generator_1.sendErrorToClient)({
        req,
        res,
        options: {
            title: `Proxy error (HTTP ${err.status})`,
            message: "Reverse proxy encountered an unexpected error while processing your request.",
            reqId: req.id,
            statusCode: err.status,
            obj: { error: err.message, stack: err.stack },
            format: "unknown",
        },
    });
});
app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
});
async function start() {
    logger_1.logger.info("Server starting up...");
    await setBuildInfo();
    logger_1.logger.info("Checking configs and external dependencies...");
    await (0, config_1.assertConfigIsValid)();
    if (config_1.config.gatekeeperStore.startsWith("firebase")) {
        logger_1.logger.info("Testing Firebase connection...");
        await (0, firebase_1.initializeFirebase)();
        logger_1.logger.info("Firebase connection successful.");
    }
    key_management_1.keyPool.init();
    await (0, tokenization_1.init)();
    if (config_1.config.allowedModelFamilies.some((f) => models_1.IMAGE_GEN_MODELS.includes(f))) {
        await (0, setup_assets_dir_1.setupAssetsDir)();
    }
    if (config_1.config.gatekeeper === "user_token") {
        await (0, user_store_1.init)();
    }
    if (config_1.config.promptLogging) {
        logger_1.logger.info("Starting prompt logging...");
        await prompt_logging_1.logQueue.start();
    }
    await (0, database_1.initializeDatabase)();
    logger_1.logger.info("Starting request queue...");
    (0, queue_1.start)();
    const diskSpace = await (0, check_disk_space_1.default)(__dirname.startsWith("/app") ? "/app" : os_1.default.homedir());
    app.listen(PORT, BIND_ADDRESS, () => {
        logger_1.logger.info({ port: PORT, interface: BIND_ADDRESS }, "Server ready to accept connections.");
        registerUncaughtExceptionHandler();
    });
    logger_1.logger.info({ build: process.env.BUILD_INFO, nodeEnv: process.env.NODE_ENV, diskSpace }, "Startup complete.");
}
function cleanup() {
    console.log("Shutting down...");
    if (config_1.config.eventLogging) {
        try {
            const db = (0, database_1.getDatabase)();
            db.close();
            console.log("Closed sqlite database.");
        }
        catch (error) { }
    }
    process.exit(0);
}
process.on("SIGINT", cleanup);
function registerUncaughtExceptionHandler() {
    process.on("uncaughtException", (err) => {
        logger_1.logger.error({ err, stack: err?.stack }, "UNCAUGHT EXCEPTION. Please report this error trace.");
    });
    process.on("unhandledRejection", (err) => {
        logger_1.logger.error({ err, stack: err?.stack }, "UNCAUGHT PROMISE REJECTION. Please report this error trace.");
    });
}
/**
 * Attepts to collect information about the current build from either the
 * environment or the git repo used to build the image (only works if not
 * .dockerignore'd). If you're running a sekrit club fork, you can no-op this
 * function and set the BUILD_INFO env var manually, though I would prefer you
 * didn't set it to something misleading.
 */
async function setBuildInfo() {
    // For CI builds, use the env vars set during the build process
    if (process.env.GITGUD_BRANCH) {
        const sha = process.env.GITGUD_COMMIT?.slice(0, 7) || "unknown SHA";
        const branch = process.env.GITGUD_BRANCH;
        const repo = process.env.GITGUD_PROJECT;
        const buildInfo = `[ci] ${sha} (${branch}@${repo})`;
        process.env.BUILD_INFO = buildInfo;
        logger_1.logger.info({ build: buildInfo }, "Using build info from CI image.");
        return;
    }
    // For render, the git directory is dockerignore'd so we use env vars
    if (process.env.RENDER) {
        const sha = process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "unknown SHA";
        const branch = process.env.RENDER_GIT_BRANCH || "unknown branch";
        const repo = process.env.RENDER_GIT_REPO_SLUG || "unknown repo";
        const buildInfo = `${sha} (${branch}@${repo})`;
        process.env.BUILD_INFO = buildInfo;
        logger_1.logger.info({ build: buildInfo }, "Got build info from Render config.");
        return;
    }
    // For huggingface and bare metal deployments, we can get the info from git
    try {
        if (process.env.SPACE_ID) {
            // TODO: may not be necessary anymore with adjusted Huggingface dockerfile
            child_process_1.default.execSync("git config --global --add safe.directory /app");
        }
        const promisifyExec = (cmd) => new Promise((resolve, reject) => {
            child_process_1.default.exec(cmd, (err, stdout) => err ? reject(err) : resolve(stdout));
        });
        const promises = [
            promisifyExec("git rev-parse --short HEAD"),
            promisifyExec("git rev-parse --abbrev-ref HEAD"),
            promisifyExec("git config --get remote.origin.url"),
            promisifyExec("git status --porcelain"),
        ].map((p) => p.then((result) => result.toString().trim()));
        let [sha, branch, remote, status] = await Promise.all(promises);
        remote = remote.match(/.*[\/:]([\w-]+)\/([\w\-.]+?)(?:\.git)?$/) || [];
        const repo = remote.slice(-2).join("/");
        status = status
            // ignore Dockerfile changes since that's how the user deploys the app
            .split("\n")
            .filter((line) => !line.endsWith("Dockerfile") && line);
        const changes = status.length > 0;
        const build = `${sha}${changes ? " (modified)" : ""} (${branch}@${repo})`;
        process.env.BUILD_INFO = build;
        logger_1.logger.info({ build, status, changes }, "Got build info from Git.");
    }
    catch (error) {
        logger_1.logger.error({
            error,
            stdout: error.stdout?.toString(),
            stderr: error.stderr?.toString(),
        }, "Failed to get commit SHA.", error);
        process.env.BUILD_INFO = "unknown";
    }
}
start();
//# sourceMappingURL=server.js.map
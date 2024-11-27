"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createQueuedProxyMiddleware = void 0;
const stream_1 = require("stream");
const http_proxy_middleware_1 = require("http-proxy-middleware");
const index_1 = require("./index");
const response_1 = require("../response");
const queue_1 = require("../../queue");
const network_1 = require("../../../shared/network");
const common_1 = require("../common");
/**
 * Returns a middleware function that accepts incoming requests and places them
 * into the request queue. When the request is dequeued, it is proxied to the
 * target URL using the given options and middleware. Non-streaming responses
 * are handled by the given `blockingResponseHandler`.
 */
function createQueuedProxyMiddleware({ target, mutations, blockingResponseHandler, }) {
    const hpmTarget = typeof target === "string" ? target : "https://setbyrouter";
    const hpmRouter = typeof target === "function" ? target : undefined;
    const [httpAgent, httpsAgent] = (0, network_1.getHttpAgents)();
    const agent = hpmTarget.startsWith("http:") ? httpAgent : httpsAgent;
    const proxyMiddleware = (0, http_proxy_middleware_1.createProxyMiddleware)({
        target: hpmTarget,
        router: hpmRouter,
        agent,
        changeOrigin: true,
        toProxy: true,
        selfHandleResponse: typeof blockingResponseHandler === "function",
        // Disable HPM logger plugin (requires re-adding the other default plugins).
        // Contrary to name, debugProxyErrorsPlugin is not just for debugging and
        // fixes several error handling/connection close issues in http-proxy core.
        ejectPlugins: true,
        // Inferred (via Options<express.Request>) as Plugin<express.Request>, but
        // the default plugins only allow http.IncomingMessage for TReq. They are
        // compatible with express.Request, so we can use them. `Plugin` type is not
        // exported for some reason.
        plugins: [
            http_proxy_middleware_1.debugProxyErrorsPlugin,
            pinoLoggerPlugin,
            http_proxy_middleware_1.proxyEventsPlugin,
        ],
        on: {
            proxyRes: (0, response_1.createOnProxyResHandler)(blockingResponseHandler ? [blockingResponseHandler] : []),
            error: common_1.classifyErrorAndSend,
        },
        buffer: ((req) => {
            // This is a hack/monkey patch and is not part of the official
            // http-proxy-middleware package. See patches/http-proxy+1.18.1.patch.
            let payload = req.body;
            if (typeof payload === "string") {
                payload = Buffer.from(payload);
            }
            const stream = new stream_1.Readable();
            stream.push(payload);
            stream.push(null);
            return stream;
        }),
    });
    return (0, queue_1.createQueueMiddleware)({
        mutations: [index_1.stripHeaders, ...(mutations ?? [])],
        proxyMiddleware,
    });
}
exports.createQueuedProxyMiddleware = createQueuedProxyMiddleware;
function pinoLoggerPlugin(proxyServer) {
    proxyServer.on("error", (err, req, res, target) => {
        req.log.error({ originalUrl: req.originalUrl, targetUrl: String(target), err }, "Error occurred while proxying request to target");
    });
    proxyServer.on("proxyReq", (proxyReq, req) => {
        const { protocol, host, path } = proxyReq;
        req.log.info({
            from: req.originalUrl,
            to: `${protocol}//${host}${path}`,
        }, "Sending request to upstream API...");
    });
    proxyServer.on("proxyRes", (proxyRes, req, _res) => {
        const { protocol, host, path } = proxyRes.req;
        req.log.info({
            target: `${protocol}//${host}${path}`,
            status: proxyRes.statusCode,
            contentType: proxyRes.headers["content-type"],
            contentEncoding: proxyRes.headers["content-encoding"],
            contentLength: proxyRes.headers["content-length"],
            transferEncoding: proxyRes.headers["transfer-encoding"],
        }, "Got response from upstream API.");
    });
}
//# sourceMappingURL=proxy-middleware-factory.js.map
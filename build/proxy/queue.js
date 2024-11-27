"use strict";
/**
 * Very scuffed request queue. OpenAI's GPT-4 keys have a very strict rate limit
 * of 40000 generated tokens per minute. We don't actually know how many tokens
 * a given key has generated, so our queue will simply retry requests that fail
 * with a non-billing related 429 over and over again until they succeed.
 *
 * When a request to a proxied endpoint is received, we create a closure around
 * the call to http-proxy-middleware and attach it to the request. This allows
 * us to pause the request until we have a key available. Further, if the
 * proxied request encounters a retryable error, we can simply put the request
 * back in the queue and it will be retried later using the same closure.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHeartbeat = exports.createQueueMiddleware = exports.getQueueLength = exports.getEstimatedWaitTime = exports.trackWaitTime = exports.start = exports.dequeue = exports.reenqueueRequest = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const errors_1 = require("../shared/errors");
const key_management_1 = require("../shared/key-management");
const models_1 = require("../shared/models");
const streaming_1 = require("../shared/streaming");
const logger_1 = require("../logger");
const rate_limit_1 = require("./rate-limit");
const error_generator_1 = require("./middleware/response/error-generator");
const proxy_req_manager_1 = require("./middleware/request/proxy-req-manager");
const common_1 = require("./middleware/common");
const queue = [];
const log = logger_1.logger.child({ module: "request-queue" });
/** Maximum number of queue slots for individual users. */
const USER_CONCURRENCY_LIMIT = parseInt(process.env.USER_CONCURRENCY_LIMIT ?? "1");
const MIN_HEARTBEAT_SIZE = parseInt(process.env.MIN_HEARTBEAT_SIZE_B ?? "512");
const MAX_HEARTBEAT_SIZE = 1024 * parseInt(process.env.MAX_HEARTBEAT_SIZE_KB ?? "1024");
const HEARTBEAT_INTERVAL = 1000 * parseInt(process.env.HEARTBEAT_INTERVAL_SEC ?? "5");
const LOAD_THRESHOLD = parseFloat(process.env.LOAD_THRESHOLD ?? "150");
const PAYLOAD_SCALE_FACTOR = parseFloat(process.env.PAYLOAD_SCALE_FACTOR ?? "6");
const QUEUE_JOIN_TIMEOUT = 5000;
/**
 * Returns an identifier for a request. This is used to determine if a
 * request is already in the queue.
 *
 * This can be (in order of preference):
 * - user token assigned by the proxy operator
 * - x-risu-tk header, if the request is from RisuAI.xyz
 * - 'shared-ip' if the request is from a shared IP address like Agnai.chat
 * - IP address
 */
function getIdentifier(req) {
    if (req.user)
        return req.user.token;
    if (req.risuToken)
        return req.risuToken;
    // if (isFromSharedIp(req)) return "shared-ip";
    return req.ip;
}
const sharesIdentifierWith = (incoming) => (queued) => getIdentifier(queued) === getIdentifier(incoming);
async function enqueue(req) {
    if (req.socket.destroyed || req.res?.writableEnded) {
        // In rare cases, a request can be disconnected after it is dequeued for a
        // retry, but before it is re-enqueued. In this case we may miss the abort
        // and the request will loop in the queue forever.
        req.log.warn("Attempt to enqueue aborted request.");
        throw new Error("Attempt to enqueue aborted request.");
    }
    const enqueuedRequestCount = queue.filter(sharesIdentifierWith(req)).length;
    if (enqueuedRequestCount >= USER_CONCURRENCY_LIMIT) {
        throw new errors_1.TooManyRequestsError("Your IP or user token already has another request in the queue.");
    }
    // shitty hack to remove hpm's event listeners on retried requests
    removeProxyMiddlewareEventListeners(req);
    // If the request opted into streaming, we need to register a heartbeat
    // handler to keep the connection alive while it waits in the queue. We
    // deregister the handler when the request is dequeued.
    const { stream } = req.body;
    if (stream === "true" || stream === true || req.isStreaming) {
        const res = req.res;
        if (!res.headersSent) {
            await initStreaming(req);
        }
        registerHeartbeat(req);
    }
    else if (getProxyLoad() > LOAD_THRESHOLD) {
        throw new errors_1.BadRequestError("Due to heavy traffic on this proxy, you must enable streaming in your chat client to use this endpoint.");
    }
    queue.push(req);
    req.queueOutTime = 0;
    const removeFromQueue = () => {
        req.log.info(`Removing aborted request from queue.`);
        const index = queue.indexOf(req);
        if (index !== -1) {
            queue.splice(index, 1);
        }
        if (req.heartbeatInterval)
            clearInterval(req.heartbeatInterval);
        if (req.monitorInterval)
            clearInterval(req.monitorInterval);
    };
    req.onAborted = removeFromQueue;
    req.res.once("close", removeFromQueue);
    if (req.retryCount ?? 0 > 0) {
        req.log.info({ retries: req.retryCount }, `Enqueued request for retry.`);
    }
    else {
        const size = req.socket.bytesRead;
        const endpoint = req.url?.split("?")[0];
        req.log.info({ size, endpoint }, `Enqueued new request.`);
    }
}
async function reenqueueRequest(req) {
    req.log.info({ key: req.key?.hash, retryCount: req.retryCount }, `Re-enqueueing request due to retryable error`);
    req.retryCount++;
    await enqueue(req);
}
exports.reenqueueRequest = reenqueueRequest;
function getQueueForPartition(partition) {
    return queue.filter((req) => (0, models_1.getModelFamilyForRequest)(req) === partition);
}
function dequeue(partition) {
    const modelQueue = getQueueForPartition(partition);
    if (modelQueue.length === 0) {
        return undefined;
    }
    const req = modelQueue.reduce((prev, curr) => prev.startTime +
        config_1.config.tokensPunishmentFactor *
            ((prev.promptTokens ?? 0) + (prev.outputTokens ?? 0)) <
        curr.startTime +
            config_1.config.tokensPunishmentFactor *
                ((curr.promptTokens ?? 0) + (curr.outputTokens ?? 0))
        ? prev
        : curr);
    queue.splice(queue.indexOf(req), 1);
    if (req.onAborted) {
        req.res.off("close", req.onAborted);
        req.onAborted = undefined;
    }
    if (req.heartbeatInterval)
        clearInterval(req.heartbeatInterval);
    if (req.monitorInterval)
        clearInterval(req.monitorInterval);
    // Track the time leaving the queue now, but don't add it to the wait times
    // yet because we don't know if the request will succeed or fail. We track
    // the time now and not after the request succeeds because we don't want to
    // include the model processing time.
    req.queueOutTime = Date.now();
    return req;
}
exports.dequeue = dequeue;
/**
 * Naive way to keep the queue moving by continuously dequeuing requests. Not
 * ideal because it limits throughput but we probably won't have enough traffic
 * or keys for this to be a problem.  If it does we can dequeue multiple
 * per tick.
 **/
function processQueue() {
    // This isn't completely correct, because a key can service multiple models.
    // Currently if a key is locked out on one model it will also stop servicing
    // the others, because we only track rate limits for the key as a whole.
    const reqs = [];
    models_1.MODEL_FAMILIES.forEach((modelFamily) => {
        const lockout = key_management_1.keyPool.getLockoutPeriod(modelFamily);
        if (lockout === 0) {
            reqs.push(dequeue(modelFamily));
        }
    });
    reqs.filter(Boolean).forEach((req) => {
        if (req?.proceed) {
            const modelFamily = (0, models_1.getModelFamilyForRequest)(req);
            req.log.info({ retries: req.retryCount, partition: modelFamily }, `Dequeuing request.`);
            req.proceed();
        }
    });
    setTimeout(processQueue, 50);
}
/**
 * Kill stalled requests after 5 minutes, and remove tracked wait times after 2
 * minutes.
 **/
function cleanQueue() {
    const now = Date.now();
    const oldRequests = queue.filter((req) => now - (req.startTime ?? now) > 5 * 60 * 1000);
    oldRequests.forEach((req) => {
        req.log.info(`Removing request from queue after 5 minutes.`);
        killQueuedRequest(req);
    });
    const index = waitTimes.findIndex((waitTime) => now - waitTime.end > 300 * 1000);
    const removed = waitTimes.splice(0, index + 1);
    log.trace({ stalledRequests: oldRequests.length, prunedWaitTimes: removed.length }, `Cleaning up request queue.`);
    setTimeout(cleanQueue, 20 * 1000);
}
function start() {
    models_1.MODEL_FAMILIES.forEach((modelFamily) => {
        historicalEmas.set(modelFamily, 0);
        currentEmas.set(modelFamily, 0);
        estimates.set(modelFamily, 0);
    });
    processQueue();
    cleanQueue();
    log.info(`Started request queue.`);
}
exports.start = start;
let waitTimes = [];
/** Adds a successful request to the list of wait times. */
function trackWaitTime(req) {
    waitTimes.push({
        partition: (0, models_1.getModelFamilyForRequest)(req),
        start: req.startTime,
        end: req.queueOutTime ?? Date.now(),
    });
}
exports.trackWaitTime = trackWaitTime;
const WAIT_TIME_INTERVAL = 3000;
const ALPHA_HISTORICAL = 0.2;
const ALPHA_CURRENT = 0.3;
const historicalEmas = new Map();
const currentEmas = new Map();
const estimates = new Map();
function getEstimatedWaitTime(partition) {
    return estimates.get(partition) ?? 0;
}
exports.getEstimatedWaitTime = getEstimatedWaitTime;
/**
 * Returns estimated wait time for the given queue partition in milliseconds.
 * Requests which are deprioritized are not included in the calculation as they
 * would skew the results due to their longer wait times.
 */
function calculateWaitTime(partition) {
    const now = Date.now();
    const recentWaits = waitTimes
        .filter((wait) => {
        const isSamePartition = wait.partition === partition;
        const isRecent = now - wait.end < 300 * 1000;
        return isSamePartition && isRecent;
    })
        .map((wait) => wait.end - wait.start);
    const recentAverage = recentWaits.length
        ? recentWaits.reduce((sum, wait) => sum + wait, 0) / recentWaits.length
        : 0;
    const historicalEma = historicalEmas.get(partition) ?? 0;
    historicalEmas.set(partition, ALPHA_HISTORICAL * recentAverage + (1 - ALPHA_HISTORICAL) * historicalEma);
    const currentWaits = queue
        .filter((req) => (0, models_1.getModelFamilyForRequest)(req) === partition)
        .map((req) => now - req.startTime);
    const longestCurrentWait = Math.max(...currentWaits, 0);
    const currentEma = currentEmas.get(partition) ?? 0;
    currentEmas.set(partition, ALPHA_CURRENT * longestCurrentWait + (1 - ALPHA_CURRENT) * currentEma);
    return (historicalEma + currentEma) / 2;
}
setInterval(() => {
    models_1.MODEL_FAMILIES.forEach((modelFamily) => {
        estimates.set(modelFamily, calculateWaitTime(modelFamily));
    });
}, WAIT_TIME_INTERVAL);
function getQueueLength(partition = "all") {
    if (partition === "all") {
        return queue.length;
    }
    const modelQueue = getQueueForPartition(partition);
    return modelQueue.length;
}
exports.getQueueLength = getQueueLength;
function createQueueMiddleware({ mutations = [], proxyMiddleware, }) {
    return async (req, res, next) => {
        req.proceed = async () => {
            // canonicalize the stream field which is set in a few places not always
            // consistently
            req.isStreaming = req.isStreaming || String(req.body.stream) === "true";
            req.body.stream = req.isStreaming;
            try {
                // Just before executing the proxyMiddleware, we will create a
                // ProxyReqManager to track modifications to the request. This allows
                // us to revert those changes if the proxied request fails with a
                // retryable error. That happens in proxyMiddleware's onProxyRes
                // handler.
                const changeManager = new proxy_req_manager_1.ProxyReqManager(req);
                req.changeManager = changeManager;
                for (const mutator of mutations) {
                    await mutator(changeManager);
                }
            }
            catch (err) {
                // Failure during request preparation is a fatal error.
                return (0, common_1.classifyErrorAndSend)(err, req, res);
            }
            proxyMiddleware(req, res, next);
        };
        try {
            await enqueue(req);
        }
        catch (err) {
            const title = err.status === 429
                ? "Proxy queue error (too many concurrent requests)"
                : "Proxy queue error (streaming required)";
            (0, error_generator_1.sendErrorToClient)({
                options: {
                    title,
                    message: err.message,
                    format: req.inboundApi,
                    reqId: req.id,
                    model: req.body?.model,
                },
                req,
                res,
            });
        }
    };
}
exports.createQueueMiddleware = createQueueMiddleware;
function killQueuedRequest(req) {
    if (!req.res || req.res.writableEnded) {
        req.log.warn(`Attempted to terminate request that has already ended.`);
        queue.splice(queue.indexOf(req), 1);
        return;
    }
    const res = req.res;
    try {
        const message = `Your request has been terminated by the proxy because it has been in the queue for more than 5 minutes.`;
        (0, error_generator_1.sendErrorToClient)({
            options: {
                title: "Proxy queue error (request killed)",
                message,
                format: req.inboundApi,
                reqId: req.id,
                model: req.body?.model,
            },
            req,
            res,
        });
    }
    catch (e) {
        req.log.error(e, `Error killing stalled request.`);
    }
}
async function initStreaming(req) {
    const res = req.res;
    (0, streaming_1.initializeSseStream)(res);
    const joinMsg = `: joining queue at position ${queue.length}\n\n${getHeartbeatPayload()}`;
    let drainTimeout;
    const welcome = new Promise((resolve, reject) => {
        const onDrain = () => {
            clearTimeout(drainTimeout);
            req.log.debug(`Client finished consuming join message.`);
            res.off("drain", onDrain);
            resolve();
        };
        drainTimeout = setTimeout(() => {
            res.off("drain", onDrain);
            res.destroy();
            reject(new Error("Unreponsive streaming client; killing connection"));
        }, QUEUE_JOIN_TIMEOUT);
        if (!res.write(joinMsg)) {
            req.log.warn("Kernel buffer is full; holding client request.");
            res.once("drain", onDrain);
        }
        else {
            clearTimeout(drainTimeout);
            resolve();
        }
    });
    await welcome;
}
/**
 * http-proxy-middleware attaches a bunch of event listeners to the req and
 * res objects which causes problems with our approach to re-enqueuing failed
 * proxied requests. This function removes those event listeners.
 * We don't have references to the original event listeners, so we have to
 * look through the list and remove HPM's listeners by looking for particular
 * strings in the listener functions. This is an astoundingly shitty way to do
 * this, but it's the best I can come up with.
 */
function removeProxyMiddlewareEventListeners(req) {
    // node_modules/http-proxy-middleware/dist/plugins/default/debug-proxy-errors-plugin.js:29
    // res.listeners('close')
    const RES_ONCLOSE = `Destroying proxyRes in proxyRes close event`;
    // node_modules/http-proxy-middleware/dist/plugins/default/debug-proxy-errors-plugin.js:19
    // res.listeners('error')
    const RES_ONERROR = `Socket error in proxyReq event`;
    // node_modules/http-proxy/lib/http-proxy/passes/web-incoming.js:146
    // req.listeners('aborted')
    const REQ_ONABORTED = `proxyReq.abort()`;
    // node_modules/http-proxy/lib/http-proxy/passes/web-incoming.js:156
    // req.listeners('error')
    const REQ_ONERROR = `if (req.socket.destroyed`;
    const res = req.res;
    const resOnClose = res
        .listeners("close")
        .find((listener) => listener.toString().includes(RES_ONCLOSE));
    if (resOnClose) {
        res.removeListener("close", resOnClose);
    }
    const resOnError = res
        .listeners("error")
        .find((listener) => listener.toString().includes(RES_ONERROR));
    if (resOnError) {
        res.removeListener("error", resOnError);
    }
    const reqOnAborted = req
        .listeners("aborted")
        .find((listener) => listener.toString().includes(REQ_ONABORTED));
    if (reqOnAborted) {
        req.removeListener("aborted", reqOnAborted);
    }
    const reqOnError = req
        .listeners("error")
        .find((listener) => listener.toString().includes(REQ_ONERROR));
    if (reqOnError) {
        req.removeListener("error", reqOnError);
    }
}
function registerHeartbeat(req) {
    const res = req.res;
    let isBufferFull = false;
    let bufferFullCount = 0;
    req.heartbeatInterval = setInterval(() => {
        if (isBufferFull) {
            bufferFullCount++;
            if (bufferFullCount >= 3) {
                req.log.error("Heartbeat skipped too many times; killing connection.");
                res.destroy();
            }
            else {
                req.log.warn({ bufferFullCount }, "Heartbeat skipped; buffer is full.");
            }
            return;
        }
        const data = getHeartbeatPayload();
        if (!res.write(data)) {
            isBufferFull = true;
            res.once("drain", () => (isBufferFull = false));
        }
    }, HEARTBEAT_INTERVAL);
    monitorHeartbeat(req);
}
exports.registerHeartbeat = registerHeartbeat;
function monitorHeartbeat(req) {
    const res = req.res;
    let lastBytesSent = 0;
    req.monitorInterval = setInterval(() => {
        const bytesSent = res.socket?.bytesWritten ?? 0;
        const bytesSinceLast = bytesSent - lastBytesSent;
        req.log.debug({
            previousBytesSent: lastBytesSent,
            currentBytesSent: bytesSent,
        }, "Heartbeat monitor check.");
        lastBytesSent = bytesSent;
        const minBytes = Math.floor(getHeartbeatSize() / 2);
        if (bytesSinceLast < minBytes) {
            req.log.warn({ minBytes, bytesSinceLast }, "Queued request is not processing heartbeats enough data or server is overloaded; killing connection.");
            res.destroy();
        }
    }, HEARTBEAT_INTERVAL * 2);
}
/** Sends larger heartbeats when the queue is overloaded */
function getHeartbeatSize() {
    const load = getProxyLoad();
    if (load <= LOAD_THRESHOLD) {
        return MIN_HEARTBEAT_SIZE;
    }
    else {
        const excessLoad = load - LOAD_THRESHOLD;
        const size = MIN_HEARTBEAT_SIZE + Math.pow(excessLoad * PAYLOAD_SCALE_FACTOR, 2);
        if (size > MAX_HEARTBEAT_SIZE)
            return MAX_HEARTBEAT_SIZE;
        return size;
    }
}
function getHeartbeatPayload() {
    const size = getHeartbeatSize();
    const data = process.env.NODE_ENV === "production"
        ? crypto_1.default.randomBytes(size).toString("base64")
        : `payload size: ${size}`;
    return `: queue heartbeat ${data}\n\n`;
}
function getProxyLoad() {
    return Math.max((0, rate_limit_1.getUniqueIps)(), queue.length);
}
//# sourceMappingURL=queue.js.map
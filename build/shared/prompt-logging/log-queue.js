"use strict";
/* Queues incoming prompts/responses and periodically flushes them to configured
 * logging backend. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.stop = exports.start = exports.flush = exports.enqueue = void 0;
const logger_1 = require("../../logger");
const backends_1 = require("./backends");
const config_1 = require("../../config");
const utils_1 = require("../utils");
const FLUSH_INTERVAL = 1000 * 10;
const MAX_BATCH_SIZE = 25;
const queue = [];
const log = logger_1.logger.child({ module: "log-queue" });
let started = false;
let timeoutId = null;
let retrying = false;
let consecutiveFailedBatches = 0;
let backend;
const enqueue = (payload) => {
    if (!started) {
        log.warn("Log queue not started, discarding incoming log entry.");
        return;
    }
    queue.push(payload);
};
exports.enqueue = enqueue;
const flush = async () => {
    if (!started) {
        return;
    }
    if (queue.length > 0) {
        const batchSize = Math.min(MAX_BATCH_SIZE, queue.length);
        const nextBatch = queue.splice(0, batchSize);
        log.info({ size: nextBatch.length }, "Submitting new batch.");
        try {
            await backend.appendBatch(nextBatch);
            retrying = false;
            consecutiveFailedBatches = 0;
        }
        catch (e) {
            if (retrying) {
                log.error({ message: e.message, stack: e.stack }, "Failed twice to flush batch, discarding.");
                retrying = false;
                consecutiveFailedBatches++;
            }
            else {
                // Put the batch back at the front of the queue and try again
                log.warn({ message: e.message, stack: e.stack }, "Failed to flush batch. Retrying.");
                queue.unshift(...nextBatch);
                retrying = true;
                setImmediate(() => (0, exports.flush)());
                return;
            }
        }
    }
    const useHalfInterval = queue.length > MAX_BATCH_SIZE / 2;
    scheduleFlush(useHalfInterval);
};
exports.flush = flush;
const start = async () => {
    const type = config_1.config.promptLoggingBackend;
    try {
        switch (type) {
            case "google_sheets":
                backend = backends_1.sheets;
                await backends_1.sheets.init(() => (0, exports.stop)());
                break;
            case "file":
                backend = backends_1.file;
                await backends_1.file.init(() => (0, exports.stop)());
                break;
            default:
                (0, utils_1.assertNever)(type);
        }
        log.info("Logging backend initialized.");
        started = true;
    }
    catch (e) {
        log.error({ error: e.message }, "Could not initialize logging backend.");
        return;
    }
    scheduleFlush();
};
exports.start = start;
const stop = () => {
    if (timeoutId) {
        clearTimeout(timeoutId);
    }
    log.info("Stopping log queue.");
    started = false;
};
exports.stop = stop;
const scheduleFlush = (halfInterval = false) => {
    if (consecutiveFailedBatches > 3) {
        // TODO: may cause memory issues on busy servers, though if we crash that
        // may actually fix the problem with logs randomly not being flushed.
        const oneMinute = 60 * 1000;
        const maxBackoff = 10 * oneMinute;
        const backoff = Math.min(consecutiveFailedBatches * oneMinute, maxBackoff);
        timeoutId = setTimeout(() => {
            (0, exports.flush)();
        }, backoff);
        log.warn({ consecutiveFailedBatches, backoffMs: backoff }, "Failed to flush 3 batches in a row, pausing for a few minutes.");
        return;
    }
    if (halfInterval) {
        log.warn({ queueSize: queue.length }, "Queue is falling behind, switching to faster flush interval.");
    }
    timeoutId = setTimeout(() => {
        (0, exports.flush)();
    }, halfInterval ? FLUSH_INTERVAL / 2 : FLUSH_INTERVAL);
};
//# sourceMappingURL=log-queue.js.map
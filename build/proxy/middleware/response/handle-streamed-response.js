"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStreamedResponse = void 0;
const stream_1 = require("stream");
const string_decoder_1 = require("string_decoder");
const util_1 = require("util");
const errors_1 = require("../../../shared/errors");
const key_management_1 = require("../../../shared/key-management");
const streaming_1 = require("../../../shared/streaming");
const queue_1 = require("../../queue");
const handle_blocking_response_1 = require("./handle-blocking-response");
const error_generator_1 = require("./error-generator");
const aws_event_stream_decoder_1 = require("./streaming/aws-event-stream-decoder");
const event_aggregator_1 = require("./streaming/event-aggregator");
const sse_message_transformer_1 = require("./streaming/sse-message-transformer");
const sse_stream_adapter_1 = require("./streaming/sse-stream-adapter");
const compression_1 = require("./compression");
const pipelineAsync = (0, util_1.promisify)(stream_1.pipeline);
/**
 * `handleStreamedResponse` consumes a streamed response from the upstream API,
 * decodes chunk-by-chunk into a stream of events, transforms those events into
 * the client's requested format, and forwards the result to the client.
 *
 * After the entire stream has been consumed, it resolves with the full response
 * body so that subsequent middleware in the chain can process it as if it were
 * a non-streaming response (to count output tokens, track usage, etc).
 *
 * In the event of an error, the request's streaming flag is unset and the
 * request is bounced back to the non-streaming response handler. If the error
 * is retryable, that handler will re-enqueue the request and also reset the
 * streaming flag. Unfortunately the streaming flag is set and unset in multiple
 * places, so it's hard to keep track of.
 */
const handleStreamedResponse = async (proxyRes, req, res) => {
    const { headers, statusCode } = proxyRes;
    if (!req.isStreaming) {
        throw new Error("handleStreamedResponse called for non-streaming request.");
    }
    if (statusCode > 201) {
        req.isStreaming = false;
        req.log.warn({ statusCode }, `Streaming request returned error status code. Falling back to non-streaming response handler.`);
        return (0, handle_blocking_response_1.handleBlockingResponse)(proxyRes, req, res);
    }
    req.log.debug({ headers }, `Starting to proxy SSE stream.`);
    // Typically, streaming will have already been initialized by the request
    // queue to send heartbeat pings.
    if (!res.headersSent) {
        (0, streaming_1.copySseResponseHeaders)(proxyRes, res);
        (0, streaming_1.initializeSseStream)(res);
    }
    const prefersNativeEvents = req.inboundApi === req.outboundApi;
    const streamOptions = {
        contentType: headers["content-type"],
        api: req.outboundApi,
        logger: req.log,
    };
    // While the request is streaming, aggregator collects all events so that we
    // can compile them into a single response object and publish that to the
    // remaining middleware. Because we have an OpenAI transformer for every
    // supported format, EventAggregator always consumes OpenAI events so that we
    // only have to write one aggregator (OpenAI input) for each output format.
    const aggregator = new event_aggregator_1.EventAggregator(req);
    const decompressor = (0, compression_1.getStreamDecompressor)(headers["content-encoding"]);
    // Decoder reads from the response bytes to produce a stream of plaintext.
    const decoder = getDecoder({ ...streamOptions, input: proxyRes });
    // Adapter consumes the decoded text and produces server-sent events so we
    // have a standard event format for the client and to translate between API
    // message formats.
    const adapter = new sse_stream_adapter_1.SSEStreamAdapter(streamOptions);
    // Transformer converts server-sent events from one vendor's API message
    // format to another.
    const transformer = new sse_message_transformer_1.SSEMessageTransformer({
        inputFormat: req.outboundApi, // The format of the upstream service's events
        outputFormat: req.inboundApi, // The format the client requested
        inputApiVersion: String(req.headers["anthropic-version"]),
        logger: req.log,
        requestId: String(req.id),
        requestedModel: req.body.model,
    })
        .on("originalMessage", (msg) => {
        if (prefersNativeEvents)
            res.write(msg);
    })
        .on("data", (msg) => {
        if (!prefersNativeEvents)
            res.write(`data: ${JSON.stringify(msg)}\n\n`);
        aggregator.addEvent(msg);
    });
    try {
        await Promise.race([
            handleAbortedStream(req, res),
            pipelineAsync(proxyRes, decompressor, decoder, adapter, transformer),
        ]);
        req.log.debug(`Finished proxying SSE stream.`);
        res.end();
        return aggregator.getFinalResponse();
    }
    catch (err) {
        if (err instanceof errors_1.RetryableError) {
            key_management_1.keyPool.markRateLimited(req.key);
            await (0, queue_1.reenqueueRequest)(req);
        }
        else if (err instanceof errors_1.BadRequestError) {
            (0, error_generator_1.sendErrorToClient)({
                req,
                res,
                options: {
                    format: req.inboundApi,
                    title: "Proxy streaming error (Bad Request)",
                    message: `The API returned an error while streaming your request. Your prompt might not be formatted correctly.\n\n*${err.message}*`,
                    reqId: req.id,
                    model: req.body?.model,
                },
            });
        }
        else {
            const { message, stack, lastEvent } = err;
            const eventText = JSON.stringify(lastEvent, null, 2) ?? "undefined";
            const errorEvent = (0, error_generator_1.buildSpoofedSSE)({
                format: req.inboundApi,
                title: "Proxy stream error",
                message: "An unexpected error occurred while streaming the response.",
                obj: { message, stack, lastEvent: eventText },
                reqId: req.id,
                model: req.body?.model,
            });
            res.write(errorEvent);
            res.write(`data: [DONE]\n\n`);
            res.end();
        }
        // At this point the response is closed. If the request resulted in any
        // tokens being consumed (suggesting a mid-stream error), we will resolve
        // and continue the middleware chain so tokens can be counted.
        if (aggregator.hasEvents()) {
            return aggregator.getFinalResponse();
        }
        else {
            // If there is nothing, then this was a completely failed prompt that
            // will not have billed any tokens. Throw to stop the middleware chain.
            throw err;
        }
    }
};
exports.handleStreamedResponse = handleStreamedResponse;
function handleAbortedStream(req, res) {
    return new Promise((resolve) => res.on("close", () => {
        if (!res.writableEnded) {
            req.log.info("Client prematurely closed connection during stream.");
        }
        resolve();
    }));
}
function getDecoder(options) {
    const { contentType, input, logger } = options;
    if (contentType?.includes("application/vnd.amazon.eventstream")) {
        return (0, aws_event_stream_decoder_1.getAwsEventStreamDecoder)({ input, logger });
    }
    else if (contentType?.includes("application/json")) {
        throw new Error("JSON streaming not supported, request SSE instead");
    }
    else {
        // Ensures split chunks across multi-byte characters are handled correctly.
        const stringDecoder = new string_decoder_1.StringDecoder("utf8");
        return new stream_1.Transform({
            readableObjectMode: true,
            writableObjectMode: false,
            transform(chunk, _encoding, callback) {
                const text = stringDecoder.write(chunk);
                if (text)
                    this.push(text);
                callback();
            },
        });
    }
}
//# sourceMappingURL=handle-streamed-response.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSEStreamAdapter = void 0;
const stream_1 = require("stream");
const errors_1 = require("../../../../shared/errors");
/**
 * Receives a stream of events in a variety of formats and transforms them into
 * Server-Sent Events.
 *
 * This is an object-mode stream, so it expects to receive objects and will emit
 * strings.
 */
class SSEStreamAdapter extends stream_1.Transform {
    isAwsStream;
    api;
    partialMessage = "";
    textDecoder = new TextDecoder("utf8");
    log;
    constructor(options) {
        super({ ...options, objectMode: true });
        this.isAwsStream =
            options?.contentType === "application/vnd.amazon.eventstream";
        this.api = options.api;
        this.log = options.logger.child({ module: "sse-stream-adapter" });
    }
    processAwsMessage(message) {
        // Per amazon, headers and body are always present. headers is an object,
        // body is a Uint8Array, potentially zero-length.
        const { headers, body } = message;
        const eventType = headers[":event-type"]?.value;
        const messageType = headers[":message-type"]?.value;
        const contentType = headers[":content-type"]?.value;
        const exceptionType = headers[":exception-type"]?.value;
        const errorCode = headers[":error-code"]?.value;
        const bodyStr = this.textDecoder.decode(body);
        switch (messageType) {
            case "event":
                if (contentType === "application/json" && eventType === "chunk") {
                    const { bytes } = JSON.parse(bodyStr);
                    const event = Buffer.from(bytes, "base64").toString("utf8");
                    const eventObj = JSON.parse(event);
                    if ("completion" in eventObj) {
                        return ["event: completion", `data: ${event}`].join(`\n`);
                    }
                    else if (eventObj.type) {
                        return [`event: ${eventObj.type}`, `data: ${event}`].join(`\n`);
                    }
                    else {
                        return `data: ${event}`;
                    }
                }
            // noinspection FallThroughInSwitchStatementJS -- non-JSON data is unexpected
            case "exception":
            case "error":
                const type = String(exceptionType || errorCode || "UnknownError").toLowerCase();
                switch (type) {
                    case "throttlingexception":
                        this.log.warn("AWS request throttled after streaming has already started; retrying");
                        throw new errors_1.RetryableError("AWS request throttled mid-stream");
                    case "validationexception":
                        try {
                            const { message } = JSON.parse(bodyStr);
                            this.log.error({ message }, "Received AWS validation error");
                            this.emit("error", new errors_1.BadRequestError(`AWS validation error: ${message}`));
                            return null;
                        }
                        catch (error) {
                            this.log.error({ body: bodyStr, error }, "Could not parse AWS validation error");
                        }
                    // noinspection FallThroughInSwitchStatementJS -- who knows what this is
                    default:
                        let text;
                        try {
                            text = JSON.parse(bodyStr).message;
                        }
                        catch (error) {
                            text = bodyStr;
                        }
                        const error = new Error(`Got mysterious error chunk: [${type}] ${text}`);
                        error.lastEvent = text;
                        this.emit("error", error);
                        return null;
                }
            default:
                // Amazon says this can't ever happen...
                this.log.error({ message }, "Received very bad AWS stream event");
                return null;
        }
    }
    _transform(data, _enc, callback) {
        try {
            if (this.isAwsStream) {
                // `data` is a Message object
                const message = this.processAwsMessage(data);
                if (message)
                    this.push(message + "\n\n");
            }
            else {
                // `data` is a string, but possibly only a partial message
                const fullMessages = (this.partialMessage + data).split(/\r\r|\n\n|\r\n\r\n/);
                this.partialMessage = fullMessages.pop() || "";
                for (const message of fullMessages) {
                    // Mixing line endings will break some clients and our request queue
                    // will have already sent \n for heartbeats, so we need to normalize
                    // to \n.
                    this.push(message.replace(/\r\n?/g, "\n") + "\n\n");
                }
            }
            callback();
        }
        catch (error) {
            error.lastEvent = data?.toString() ?? "[SSEStreamAdapter] no data";
            callback(error);
        }
    }
    _flush(callback) {
        callback();
    }
}
exports.SSEStreamAdapter = SSEStreamAdapter;
//# sourceMappingURL=sse-stream-adapter.js.map
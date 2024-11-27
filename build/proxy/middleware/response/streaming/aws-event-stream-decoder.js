"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAwsEventStreamDecoder = void 0;
const stream_1 = require("stream");
const eventstream_serde_node_1 = require("@smithy/eventstream-serde-node");
const util_utf8_1 = require("@smithy/util-utf8");
/**
 * Decodes a Readable stream, such as a proxied HTTP response, into a stream of
 * Message objects using the AWS SDK's EventStreamMarshaller. Error events in
 * the amazon eventstream protocol are decoded as Message objects and will not
 * emit an error event on the decoder stream.
 */
function getAwsEventStreamDecoder(params) {
    const { input, logger } = params;
    const config = { utf8Encoder: util_utf8_1.toUtf8, utf8Decoder: util_utf8_1.fromUtf8 };
    const eventStream = new eventstream_serde_node_1.EventStreamMarshaller(config).deserialize(input, async (input) => {
        const eventType = Object.keys(input)[0];
        let result;
        if (eventType === "chunk") {
            result = input[eventType];
        }
        else {
            // AWS unmarshaller treats non-chunk events (errors and exceptions) oddly.
            result = { [eventType]: input[eventType] };
        }
        return result;
    });
    return new AWSEventStreamDecoder(eventStream, { logger });
}
exports.getAwsEventStreamDecoder = getAwsEventStreamDecoder;
class AWSEventStreamDecoder extends stream_1.Duplex {
    asyncIterable;
    iterator;
    reading;
    logger;
    constructor(asyncIterable, options) {
        super({ ...options, objectMode: true });
        this.asyncIterable = asyncIterable;
        this.iterator = this.asyncIterable[Symbol.asyncIterator]();
        this.reading = false;
        this.logger = options.logger.child({ module: "aws-eventstream-decoder" });
    }
    async _read(_size) {
        if (this.reading)
            return;
        this.reading = true;
        try {
            while (true) {
                const { value, done } = await this.iterator.next();
                if (done) {
                    this.push(null);
                    break;
                }
                if (!this.push(value))
                    break;
            }
        }
        catch (err) {
            // AWS SDK's EventStreamMarshaller emits errors in the stream itself as
            // whatever our deserializer returns, which will not be Error objects
            // because we want to pass the Message to the next stream for processing.
            // Any actual Error thrown here is some failure during deserialization.
            const isAwsError = !(err instanceof Error);
            if (isAwsError) {
                this.logger.warn({ err: err.headers }, "Received AWS error event");
                this.push(err);
                this.push(null);
            }
            else {
                this.logger.error(err, "Error during AWS stream deserialization");
                this.destroy(err);
            }
        }
        finally {
            this.reading = false;
        }
    }
    _write(_chunk, _encoding, callback) {
        callback();
    }
    _final(callback) {
        callback();
    }
}
//# sourceMappingURL=aws-event-stream-decoder.js.map
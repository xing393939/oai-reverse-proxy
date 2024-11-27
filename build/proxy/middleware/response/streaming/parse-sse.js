"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEvent = void 0;
/** Given a string of SSE data, parse it into a `ServerSentEvent` object. */
function parseEvent(event) {
    const buffer = { data: "" };
    return event.split(/\r?\n/).reduce(parseLine, buffer);
}
exports.parseEvent = parseEvent;
function parseLine(event, line) {
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1);
    switch (field) {
        case "id":
            event.id = value.trim();
            break;
        case "event":
            event.type = value.trim();
            break;
        case "data":
            event.data += value.trimStart();
            break;
        default:
            break;
    }
    return event;
}
//# sourceMappingURL=parse-sse.js.map
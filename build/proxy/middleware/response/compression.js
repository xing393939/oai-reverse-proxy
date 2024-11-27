"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStreamDecompressor = exports.decompressBuffer = void 0;
const util_1 = __importDefault(require("util"));
const zlib_1 = __importDefault(require("zlib"));
const stream_1 = require("stream");
const BUFFER_DECODER_MAP = {
    gzip: util_1.default.promisify(zlib_1.default.gunzip),
    deflate: util_1.default.promisify(zlib_1.default.inflate),
    br: util_1.default.promisify(zlib_1.default.brotliDecompress),
    text: (data) => data,
};
const STREAM_DECODER_MAP = {
    gzip: zlib_1.default.createGunzip,
    deflate: zlib_1.default.createInflate,
    br: zlib_1.default.createBrotliDecompress,
    text: () => new stream_1.PassThrough(),
};
const isSupportedContentEncoding = (encoding) => encoding in BUFFER_DECODER_MAP;
async function decompressBuffer(buf, encoding = "text") {
    if (isSupportedContentEncoding(encoding)) {
        return (await BUFFER_DECODER_MAP[encoding](buf)).toString();
    }
    throw new Error(`Unsupported content-encoding: ${encoding}`);
}
exports.decompressBuffer = decompressBuffer;
function getStreamDecompressor(encoding = "text") {
    if (isSupportedContentEncoding(encoding)) {
        return STREAM_DECODER_MAP[encoding]();
    }
    throw new Error(`Unsupported content-encoding: ${encoding}`);
}
exports.getStreamDecompressor = getStreamDecompressor;
//# sourceMappingURL=compression.js.map
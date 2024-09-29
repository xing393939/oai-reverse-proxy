import { Request, Response } from "express";
import util from "util";
import zlib from "zlib";
import { sendProxyError } from "../common";
import type { RawResponseBodyHandler } from "./index";

const DECODER_MAP = {
  gzip: util.promisify(zlib.gunzip),
  deflate: util.promisify(zlib.inflate),
  br: util.promisify(zlib.brotliDecompress),
  text: (data: Buffer) => data,
};
type SupportedContentEncoding = keyof typeof DECODER_MAP;

const isSupportedContentEncoding = (
  encoding: string
): encoding is SupportedContentEncoding => encoding in DECODER_MAP;

/**
 * Handles the response from the upstream service and decodes the body if
 * necessary. If the response is JSON, it will be parsed and returned as an
 * object. Otherwise, it will be returned as a string. Does not handle streaming
 * responses.
 * @throws {Error} Unsupported content-encoding or invalid application/json body
 */
export const handleBlockingResponse: RawResponseBodyHandler = async (
  proxyRes,
  req,
  res
) => {
  if (req.isStreaming) {
    const err = new Error(
      "handleBlockingResponse called for a streaming request."
    );
    req.log.error({ stack: err.stack, api: req.inboundApi }, err.message);
    throw err;
  }

  return new Promise((resolve, reject) => {
    let chunks: Buffer[] = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", async () => {
      let body: string | Buffer = Buffer.concat(chunks);
      const rejectWithMessage = function (msg: string, err: Error) {
        const error = `${msg} (${err.message})`;
        req.log.warn({ stack: err.stack }, error);
        sendProxyError(req, res, 500, "Internal Server Error", { error });
        return reject(error);
      };

      const contentEncoding = proxyRes.headers["content-encoding"] ?? "text";
      if (isSupportedContentEncoding(contentEncoding)) {
        try {
          body = (await DECODER_MAP[contentEncoding](body)).toString();
        } catch (e) {
          return rejectWithMessage(`Could not decode response body`, e);
        }
      } else {
        return rejectWithMessage(
          "API responded with unsupported content encoding",
          new Error(`Unsupported content-encoding: ${contentEncoding}`)
        );
      }

      try {
        if (proxyRes.headers["content-type"]?.includes("application/json")) {
          return resolve(JSON.parse(body));
        }
        return resolve(body);
      } catch (e) {
        return rejectWithMessage("API responded with invalid JSON", e);
      }
    });
  });
};

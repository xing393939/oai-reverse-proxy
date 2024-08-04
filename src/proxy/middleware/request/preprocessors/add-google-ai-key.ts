import { keyPool } from "../../../../shared/key-management";
import { RequestPreprocessor } from "../index";

export const addGoogleAIKey: RequestPreprocessor = (req) => {
  const inboundValid =
    req.inboundApi === "openai" || req.inboundApi === "google-ai";
  const outboundValid = req.outboundApi === "google-ai";
  
  const serviceValid = req.service === "google-ai";
  if (!inboundValid || !outboundValid || !serviceValid) {
    throw new Error("addGoogleAIKey called on invalid request");
  }
  
  const model = req.body.model;
  req.isStreaming = req.isStreaming || req.body.stream;
  req.key = keyPool.get(model, "google-ai");
  req.log.info(
    { key: req.key.hash, model, stream: req.isStreaming },
    "Assigned Google AI API key to request"
  );
  
  // https://generativelanguage.googleapis.com/v1beta/models/$MODEL_ID:generateContent?key=$API_KEY
  // https://generativelanguage.googleapis.com/v1beta/models/$MODEL_ID:streamGenerateContent?key=${API_KEY}
  const payload = { ...req.body, stream: undefined, model: undefined };

  req.signedRequest = {
    method: "POST",
    protocol: "https:",
    hostname: "generativelanguage.googleapis.com",
    path: `/v1beta/models/${model}:${
      req.isStreaming ? "streamGenerateContent" : "generateContent"
    }?key=${req.key.key}`,
    headers: {
      ["host"]: `generativelanguage.googleapis.com`,
      ["content-type"]: "application/json",
    },
    body: JSON.stringify(payload),
  };
};

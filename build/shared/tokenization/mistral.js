"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenCount = exports.init = void 0;
const tokenizer = __importStar(require("./mistral-tokenizer-js"));
function init() {
    tokenizer.initializemistralTokenizer();
    return true;
}
exports.init = init;
function getTokenCount(prompt) {
    if (typeof prompt === "string") {
        return getTextTokenCount(prompt);
    }
    let chunks = [];
    for (const message of prompt) {
        switch (message.role) {
            case "system":
                chunks.push(message.content);
                break;
            case "assistant":
                chunks.push(message.content + "</s>");
                break;
            case "user":
                chunks.push("[INST] " + message.content + " [/INST]");
                break;
        }
    }
    return getTextTokenCount(chunks.join(" "));
}
exports.getTokenCount = getTokenCount;
function getTextTokenCount(prompt) {
    if (prompt.length > 800000) {
        throw new Error("Content is too large to tokenize.");
    }
    return {
        tokenizer: "mistral-tokenizer-js",
        token_count: tokenizer.encode(prompt.normalize("NFKC")).length,
    };
}
//# sourceMappingURL=mistral.js.map
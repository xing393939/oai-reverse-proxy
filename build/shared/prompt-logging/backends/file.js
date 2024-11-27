"use strict";
// stolen from https://gitgud.io/fiz1/oai-reverse-proxy
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
exports.fileBackend = exports.currentFileNumber = void 0;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const config_1 = require("../../../config");
const logger_1 = require("../../../logger");
const glob_1 = require("glob");
const MAX_FILE_SIZE = 100 * 1024 * 1024;
let currentFileNumber = 0;
exports.currentFileNumber = currentFileNumber;
let currentFilePath = "";
let currentFileSize = 0;
exports.fileBackend = {
    init: async (_onStop) => {
        try {
            await createNewLogFile();
        }
        catch (error) {
            logger_1.logger.error("Error initializing file backend", error);
            throw error;
        }
        const files = glob_1.glob.sync(path.join(config_1.USER_ASSETS_DIR, `${config_1.config.promptLoggingFilePrefix}*.jsonl`), { windowsPathsNoEscape: true });
        const sorted = files.sort((a, b) => {
            const aNum = parseInt(path.basename(a).replace(/[^0-9]/g, ""), 10);
            const bNum = parseInt(path.basename(b).replace(/[^0-9]/g, ""), 10);
            return aNum - bNum;
        });
        if (sorted.length > 0) {
            const latestFile = sorted[sorted.length - 1];
            const stats = await fs_1.promises.stat(latestFile);
            exports.currentFileNumber = currentFileNumber = parseInt(path.basename(latestFile).replace(/[^0-9]/g, ""), 10);
            currentFilePath = latestFile;
            currentFileSize = stats.size;
        }
        logger_1.logger.info({ currentFileNumber, currentFilePath, currentFileSize }, "File backend initialized");
    },
    appendBatch: async (batch) => {
        try {
            if (currentFileSize > MAX_FILE_SIZE) {
                await createNewLogFile();
            }
            const batchString = batch
                .map((entry) => JSON.stringify({
                endpoint: entry.endpoint,
                model: entry.model,
                prompt: entry.promptRaw,
                response: entry.response,
            }))
                .join("\n") + "\n";
            const batchSizeBytes = Buffer.byteLength(batchString);
            const batchLines = batch.length;
            logger_1.logger.debug({ batchLines, batchSizeBytes, currentFileSize, file: currentFilePath }, "Appending batch to file");
            await fs_1.promises.appendFile(currentFilePath, batchString);
            currentFileSize += Buffer.byteLength(batchString);
        }
        catch (error) {
            logger_1.logger.error("Error appending batch to file", error);
            throw error;
        }
    },
};
async function createNewLogFile() {
    exports.currentFileNumber = (currentFileNumber++, currentFileNumber);
    currentFilePath = path.join(config_1.USER_ASSETS_DIR, `${config_1.config.promptLoggingFilePrefix}${currentFileNumber}.jsonl`);
    currentFileSize = 0;
    await fs_1.promises.writeFile(currentFilePath, "");
    logger_1.logger.info(`Created new log file: ${currentFilePath}`);
}
//# sourceMappingURL=file.js.map
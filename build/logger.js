"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("./config");
const transport = process.env.NODE_ENV === "production"
    ? undefined
    : {
        target: "pino-pretty",
        options: {
            singleLine: true,
            messageFormat: "{if module}\x1b[90m[{module}] \x1b[39m{end}{msg}",
            ignore: "module",
        },
    };
exports.logger = (0, pino_1.default)({
    level: config_1.config.logLevel,
    base: { pid: process.pid, module: "server" },
    transport,
});
//# sourceMappingURL=logger.js.map
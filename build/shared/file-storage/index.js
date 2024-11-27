"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.libSharp = void 0;
// We need to control the timing of when sharp is imported because it has a
// native dependency that causes conflicts with node-canvas if they are not
// imported in a specific order.
const sharp_1 = __importDefault(require("sharp"));
exports.libSharp = sharp_1.default;
//# sourceMappingURL=index.js.map
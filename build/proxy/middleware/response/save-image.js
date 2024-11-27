"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveImage = void 0;
const mirror_generated_image_1 = require("../../../shared/file-storage/mirror-generated-image");
const saveImage = async (_proxyRes, req, _res, body) => {
    if (req.outboundApi !== "openai-image") {
        return;
    }
    if (typeof body !== "object") {
        throw new Error("Expected body to be an object");
    }
    if (body.data) {
        const prompt = body.data[0].revised_prompt ?? req.body.prompt;
        const res = await (0, mirror_generated_image_1.mirrorGeneratedImage)(req, prompt, body);
        req.log.info({ urls: res.data.map((item) => item.url) }, "Saved generated image to user_content");
    }
};
exports.saveImage = saveImage;
//# sourceMappingURL=save-image.js.map
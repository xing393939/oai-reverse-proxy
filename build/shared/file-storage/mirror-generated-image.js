"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mirrorGeneratedImage = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const config_1 = require("../../config");
const network_1 = require("../network");
const image_history_1 = require("./image-history");
const index_1 = require("./index");
const axios = (0, network_1.getAxiosInstance)();
async function downloadImage(url) {
    const { data } = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(data, "binary");
    const newFilename = `${(0, uuid_1.v4)()}.png`;
    const filepath = path_1.default.join(config_1.USER_ASSETS_DIR, newFilename);
    await fs_1.promises.writeFile(filepath, buffer);
    return filepath;
}
async function saveB64Image(b64) {
    const buffer = Buffer.from(b64, "base64");
    const newFilename = `${(0, uuid_1.v4)()}.png`;
    const filepath = path_1.default.join(config_1.USER_ASSETS_DIR, newFilename);
    await fs_1.promises.writeFile(filepath, buffer);
    return filepath;
}
async function createThumbnail(filepath) {
    const thumbnailPath = filepath.replace(/(\.[\wd_-]+)$/i, "_t.jpg");
    await (0, index_1.libSharp)(filepath)
        .resize(150, 150, {
        fit: "inside",
        withoutEnlargement: true,
    })
        .toFormat("jpeg")
        .toFile(thumbnailPath);
    return thumbnailPath;
}
/**
 * Downloads generated images and mirrors them to the user_content directory.
 * Mutates the result object.
 */
async function mirrorGeneratedImage(req, prompt, result) {
    const host = req.protocol + "://" + req.get("host");
    for (const item of result.data) {
        let mirror;
        if (item.b64_json) {
            mirror = await saveB64Image(item.b64_json);
        }
        else {
            mirror = await downloadImage(item.url);
        }
        item.url = `${host}/user_content/${path_1.default.basename(mirror)}`;
        await createThumbnail(mirror);
        (0, image_history_1.addToImageHistory)({
            url: item.url,
            prompt,
            inputPrompt: req.body.prompt,
            token: req.user?.token
        });
    }
    return result;
}
exports.mirrorGeneratedImage = mirrorGeneratedImage;
//# sourceMappingURL=mirror-generated-image.js.map
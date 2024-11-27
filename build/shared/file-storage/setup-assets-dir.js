"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAssetsDir = void 0;
const fs_1 = require("fs");
const logger_1 = require("../../logger");
const config_1 = require("../../config");
const log = logger_1.logger.child({ module: "file-storage" });
async function setupAssetsDir() {
    try {
        log.info({ dir: config_1.USER_ASSETS_DIR }, "Setting up user assets directory");
        await fs_1.promises.mkdir(config_1.USER_ASSETS_DIR, { recursive: true });
        const stats = await fs_1.promises.stat(config_1.USER_ASSETS_DIR);
        const mode = stats.mode | 0o666;
        if (stats.mode !== mode) {
            await fs_1.promises.chmod(config_1.USER_ASSETS_DIR, mode);
        }
    }
    catch (e) {
        log.error(e);
        throw new Error("Could not create user assets directory for DALL-E image generation. You may need to update your Dockerfile to `chown` the working directory to user 1000. See the proxy docs for more information.");
    }
}
exports.setupAssetsDir = setupAssetsDir;
//# sourceMappingURL=setup-assets-dir.js.map
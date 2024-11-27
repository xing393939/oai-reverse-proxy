"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.browseImagesRouter = void 0;
const express_1 = __importDefault(require("express"));
const image_history_1 = require("../../shared/file-storage/image-history");
const utils_1 = require("../../shared/utils");
const rate_limit_1 = require("../../proxy/rate-limit");
const IMAGES_PER_PAGE = 24;
const metadataCacheTTL = 1000 * 60 * 3;
let metadataCache = null;
let metadataCacheValid = 0;
const handleImageHistoryPage = (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const allImages = (0, image_history_1.getLastNImages)();
    const { items, pageCount } = (0, utils_1.paginate)(allImages, page, IMAGES_PER_PAGE);
    res.render("image_history", {
        images: items,
        pagination: {
            currentPage: page,
            totalPages: pageCount,
        },
    });
};
const handleMetadataRequest = (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=180");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="image-metadata-${new Date().toISOString()}.json"`);
    if (new Date().getTime() - metadataCacheValid < metadataCacheTTL) {
        return res.status(200).send(metadataCache);
    }
    const images = (0, image_history_1.getLastNImages)().map(({ prompt, url }) => ({ url, prompt }));
    const metadata = {
        exportedAt: new Date().toISOString(),
        totalImages: images.length,
        images,
    };
    metadataCache = JSON.stringify(metadata, null, 2);
    metadataCacheValid = new Date().getTime();
    res.status(200).send(metadataCache);
};
exports.browseImagesRouter = express_1.default.Router();
exports.browseImagesRouter.get("/image-history", handleImageHistoryPage);
exports.browseImagesRouter.get("/image-history/metadata", rate_limit_1.ipLimiter, handleMetadataRequest);
//# sourceMappingURL=browse-images.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastNImages = exports.addToImageHistory = void 0;
const IMAGE_HISTORY_SIZE = 10000;
const imageHistory = new Array(IMAGE_HISTORY_SIZE);
let index = 0;
function addToImageHistory(image) {
    if (image.token?.length) {
        image.token = `...${image.token.slice(-5)}`;
    }
    imageHistory[index] = image;
    index = (index + 1) % IMAGE_HISTORY_SIZE;
}
exports.addToImageHistory = addToImageHistory;
function getLastNImages(n = IMAGE_HISTORY_SIZE) {
    const result = [];
    let currentIndex = (index - 1 + IMAGE_HISTORY_SIZE) % IMAGE_HISTORY_SIZE;
    for (let i = 0; i < n; i++) {
        if (imageHistory[currentIndex])
            result.unshift(imageHistory[currentIndex]);
        currentIndex = (currentIndex - 1 + IMAGE_HISTORY_SIZE) % IMAGE_HISTORY_SIZE;
    }
    return result;
}
exports.getLastNImages = getLastNImages;
//# sourceMappingURL=image-history.js.map
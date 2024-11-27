"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setApiFormat = void 0;
const setApiFormat = (api) => {
    return function configureRequestApiFormat(req) {
        req.inboundApi = api.inApi;
        req.outboundApi = api.outApi;
        req.service = api.service;
    };
};
exports.setApiFormat = setApiFormat;
//# sourceMappingURL=set-api-format.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyReqManager = void 0;
const utils_1 = require("../../../shared/utils");
/**
 * Manages a request's headers, body, and path, allowing them to be modified
 * before the request is proxied and automatically reverted if the request
 * needs to be retried.
 */
class ProxyReqManager {
    req;
    mutations = [];
    /**
     * A read-only proxy of the request object. Avoid changing any properties
     * here as they will persist across retries.
     */
    request;
    constructor(req) {
        this.req = req;
        this.request = new Proxy(req, {
            get: (target, prop) => {
                if (typeof prop === "string")
                    return target[prop];
                return undefined;
            },
        });
    }
    setHeader(name, newValue) {
        const originalValue = this.req.get(name);
        this.mutations.push({ target: "header", key: name, originalValue });
        this.req.headers[name.toLowerCase()] = newValue;
    }
    removeHeader(name) {
        const originalValue = this.req.get(name);
        this.mutations.push({ target: "header", key: name, originalValue });
        delete this.req.headers[name.toLowerCase()];
    }
    setBody(newBody) {
        const originalValue = this.req.body;
        this.mutations.push({ target: "body", key: "body", originalValue });
        this.req.body = newBody;
    }
    setKey(newKey) {
        const originalValue = this.req.key;
        this.mutations.push({ target: "api-key", key: "key", originalValue });
        this.req.key = newKey;
    }
    setPath(newPath) {
        const originalValue = this.req.path;
        this.mutations.push({ target: "path", key: "path", originalValue });
        this.req.url = newPath;
    }
    setSignedRequest(newSignedRequest) {
        const originalValue = this.req.signedRequest;
        this.mutations.push({ target: "signed-request", key: "signedRequest", originalValue });
        this.req.signedRequest = newSignedRequest;
    }
    hasChanged() {
        return this.mutations.length > 0;
    }
    revert() {
        for (const mutation of this.mutations.reverse()) {
            switch (mutation.target) {
                case "header":
                    if (mutation.originalValue === undefined) {
                        delete this.req.headers[mutation.key.toLowerCase()];
                        continue;
                    }
                    else {
                        this.req.headers[mutation.key.toLowerCase()] =
                            mutation.originalValue;
                    }
                    break;
                case "path":
                    this.req.url = mutation.originalValue;
                    break;
                case "body":
                    this.req.body = mutation.originalValue;
                    break;
                case "api-key":
                    // We don't reset the key here because it's not a property of the
                    // inbound request, so we'd only ever be reverting it to null.
                    break;
                case "signed-request":
                    this.req.signedRequest = mutation.originalValue;
                    break;
                default:
                    (0, utils_1.assertNever)(mutation.target);
            }
        }
        this.mutations = [];
    }
}
exports.ProxyReqManager = ProxyReqManager;
//# sourceMappingURL=proxy-req-manager.js.map
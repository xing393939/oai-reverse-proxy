"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAxiosInstance = exports.getHttpAgents = void 0;
const axios_1 = __importDefault(require("axios"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const os_1 = __importDefault(require("os"));
const proxy_agent_1 = require("proxy-agent");
const config_1 = require("../config");
const logger_1 = require("../logger");
const log = logger_1.logger.child({ module: "network" });
/** HTTP agent used by http-proxy-middleware when forwarding requests. */
let httpAgent;
/** HTTPS agent used by http-proxy-middleware when forwarding requests. */
let httpsAgent;
/** Axios instance used for any non-proxied requests. */
let axiosInstance;
function getInterfaceAddress(iface) {
    const ifaces = os_1.default.networkInterfaces();
    log.debug({ ifaces, iface }, "Found network interfaces.");
    if (!ifaces[iface]) {
        throw new Error(`Interface ${iface} not found.`);
    }
    const addresses = ifaces[iface].filter(({ family, internal }) => family === "IPv4" && !internal);
    if (addresses.length === 0) {
        throw new Error(`Interface ${iface} has no external IPv4 addresses.`);
    }
    log.debug({ selected: addresses[0] }, "Selected network interface.");
    return addresses[0].address;
}
function getHttpAgents() {
    if (httpAgent)
        return [httpAgent, httpsAgent];
    const { interface: iface, proxyUrl } = config_1.config.httpAgent || {};
    if (iface) {
        const address = getInterfaceAddress(iface);
        httpAgent = new http_1.default.Agent({ localAddress: address, keepAlive: true });
        httpsAgent = new https_1.default.Agent({ localAddress: address, keepAlive: true });
        log.info({ address }, "Using configured interface for outgoing requests.");
    }
    else if (proxyUrl) {
        process.env.HTTP_PROXY = proxyUrl;
        process.env.HTTPS_PROXY = proxyUrl;
        process.env.WS_PROXY = proxyUrl;
        process.env.WSS_PROXY = proxyUrl;
        httpAgent = new proxy_agent_1.ProxyAgent();
        httpsAgent = httpAgent; // ProxyAgent automatically handles HTTPS
        const proxy = proxyUrl.replace(/:.*@/, "@******");
        log.info({ proxy }, "Using proxy server for outgoing requests.");
    }
    else {
        httpAgent = new http_1.default.Agent();
        httpsAgent = new https_1.default.Agent();
    }
    return [httpAgent, httpsAgent];
}
exports.getHttpAgents = getHttpAgents;
function getAxiosInstance() {
    if (axiosInstance)
        return axiosInstance;
    const [httpAgent, httpsAgent] = getHttpAgents();
    axiosInstance = axios_1.default.create({ httpAgent, httpsAgent, proxy: false });
    return axiosInstance;
}
exports.getAxiosInstance = getAxiosInstance;
//# sourceMappingURL=network.js.map
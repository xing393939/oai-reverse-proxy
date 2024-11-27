"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCredentialsFromGcpKey = exports.refreshGcpAccessToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
const network_1 = require("../../network");
const logger_1 = require("../../../logger");
const axios = (0, network_1.getAxiosInstance)();
const log = logger_1.logger.child({ module: "gcp-oauth" });
const authUrl = "https://www.googleapis.com/oauth2/v4/token";
const scope = "https://www.googleapis.com/auth/cloud-platform";
async function refreshGcpAccessToken(key) {
    log.info({ key: key.hash }, "Entering GCP OAuth flow...");
    const { clientEmail, privateKey } = await getCredentialsFromGcpKey(key);
    // https://developers.google.com/identity/protocols/oauth2/service-account#authorizingrequests
    const jwt = await createSignedJWT(clientEmail, privateKey);
    log.info({ key: key.hash }, "Signed JWT, exchanging for access token...");
    const res = await axios.post(authUrl, {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
    }, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: () => true,
    });
    const status = res.status;
    const headers = res.headers;
    const data = res.data;
    if ("error" in data || status >= 400) {
        log.error({ key: key.hash, status, headers, data }, "Error from Google Identity API while getting access token.");
        throw new Error(`Google Identity API returned error: ${data.error}`);
    }
    log.info({ key: key.hash, exp: data.expires_in }, "Got access token.");
    return [data.access_token, data.expires_in];
}
exports.refreshGcpAccessToken = refreshGcpAccessToken;
async function getCredentialsFromGcpKey(key) {
    const [projectId, clientEmail, region, rawPrivateKey] = key.key.split(":");
    if (!projectId || !clientEmail || !region || !rawPrivateKey) {
        log.error({ key: key.hash }, "Cannot parse GCP credentials. Ensure they are in the format PROJECT_ID:CLIENT_EMAIL:REGION:PRIVATE_KEY, and ensure no whitespace or newlines are in the private key.");
        throw new Error("Cannot parse GCP credentials.");
    }
    if (!key.privateKey) {
        await importPrivateKey(key, rawPrivateKey);
    }
    return { projectId, clientEmail, region, privateKey: key.privateKey };
}
exports.getCredentialsFromGcpKey = getCredentialsFromGcpKey;
async function createSignedJWT(email, pkey) {
    const issued = Math.floor(Date.now() / 1000);
    const expires = issued + 600;
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
        iss: email,
        aud: authUrl,
        iat: issued,
        exp: expires,
        scope,
    };
    const encodedHeader = urlSafeBase64Encode(JSON.stringify(header));
    const encodedPayload = urlSafeBase64Encode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto_1.default.subtle.sign("RSASSA-PKCS1-v1_5", pkey, new TextEncoder().encode(unsignedToken));
    const encodedSignature = urlSafeBase64Encode(signature);
    return `${unsignedToken}.${encodedSignature}`;
}
async function importPrivateKey(key, rawPrivateKey) {
    log.info({ key: key.hash }, "Importing GCP private key...");
    const privateKey = rawPrivateKey
        .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r|\n|\\n/g, "")
        .trim();
    const binaryKey = Buffer.from(privateKey, "base64");
    key.privateKey = await crypto_1.default.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["sign"]);
    log.info({ key: key.hash }, "GCP private key imported.");
}
function urlSafeBase64Encode(data) {
    let base64;
    if (typeof data === "string") {
        base64 = btoa(encodeURIComponent(data).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode(parseInt("0x" + p1, 16))));
    }
    else {
        base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
    }
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
//# sourceMappingURL=oauth.js.map
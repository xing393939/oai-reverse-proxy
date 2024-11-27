"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirebaseApp = exports.initializeFirebase = void 0;
const config_1 = require("../config");
const network_1 = require("./network");
let firebaseApp;
async function initializeFirebase() {
    const firebase = await Promise.resolve().then(() => __importStar(require("firebase-admin")));
    const firebaseKey = Buffer.from(config_1.config.firebaseKey, "base64").toString();
    const app = firebase.initializeApp({
        // RTDB doesn't actually seem to use this but respects `WS_PROXY` if set,
        // so we do that in the network module.
        httpAgent: (0, network_1.getHttpAgents)()[0],
        credential: firebase.credential.cert(JSON.parse(firebaseKey)),
        databaseURL: config_1.config.firebaseRtdbUrl,
    });
    await app.database().ref("connection-test").set(Date.now());
    firebaseApp = app;
}
exports.initializeFirebase = initializeFirebase;
function getFirebaseApp() {
    if (!firebaseApp) {
        throw new Error("Firebase app not initialized.");
    }
    return firebaseApp;
}
exports.getFirebaseApp = getFirebaseApp;
//# sourceMappingURL=firebase.js.map
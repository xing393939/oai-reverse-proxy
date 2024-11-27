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
exports.migrateDatabase = exports.initializeDatabase = exports.getDatabase = exports.DATABASE_VERSION = void 0;
const config_1 = require("../../config");
const logger_1 = require("../../logger");
const migrations_1 = require("./migrations");
exports.DATABASE_VERSION = 3;
let database;
let log = logger_1.logger.child({ module: "database" });
function getDatabase() {
    if (!database) {
        throw new Error("Sqlite database not initialized.");
    }
    return database;
}
exports.getDatabase = getDatabase;
async function initializeDatabase() {
    if (!config_1.config.eventLogging) {
        return;
    }
    log.info("Initializing database...");
    const sqlite3 = await Promise.resolve().then(() => __importStar(require("better-sqlite3")));
    database = sqlite3.default(config_1.config.sqliteDataPath);
    migrateDatabase();
    database.pragma("journal_mode = WAL");
    log.info("Database initialized.");
}
exports.initializeDatabase = initializeDatabase;
function migrateDatabase(targetVersion = exports.DATABASE_VERSION, targetDb) {
    const db = targetDb || getDatabase();
    const currentVersion = db.pragma("user_version", { simple: true });
    assertNumber(currentVersion);
    if (currentVersion === targetVersion) {
        log.info("No migrations to run.");
        return;
    }
    const direction = currentVersion < targetVersion ? "up" : "down";
    const pending = migrations_1.migrations
        .slice()
        .sort((a, b) => direction === "up" ? a.version - b.version : b.version - a.version)
        .filter((m) => direction === "up"
        ? m.version > currentVersion && m.version <= targetVersion
        : m.version > targetVersion && m.version <= currentVersion);
    if (pending.length === 0) {
        log.warn("No pending migrations found.");
        return;
    }
    for (const migration of pending) {
        const { version, name, up, down } = migration;
        if ((direction === "up" && version > currentVersion) ||
            (direction === "down" && version <= currentVersion)) {
            if (direction === "up") {
                log.info({ name }, "Applying migration.");
                up(db);
                db.pragma("user_version = " + version);
            }
            else {
                log.info({ name }, "Reverting migration.");
                down(db);
                db.pragma("user_version = " + (version - 1));
            }
        }
    }
    log.info("Migrations applied.");
}
exports.migrateDatabase = migrateDatabase;
function assertNumber(value) {
    if (typeof value !== "number") {
        throw new Error("Expected number");
    }
}
//# sourceMappingURL=index.js.map
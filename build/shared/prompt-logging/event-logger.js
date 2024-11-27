"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = void 0;
const config_1 = require("../../config");
const event_1 = require("../database/repos/event");
const logEvent = (payload) => {
    if (!config_1.config.eventLogging) {
        return;
    }
    event_1.eventsRepo.logEvent({ ...payload, date: new Date().toISOString() });
};
exports.logEvent = logEvent;
//# sourceMappingURL=event-logger.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventsRepo = void 0;
const index_1 = require("../index");
exports.eventsRepo = {
    getUserEvents: (userToken, { limit, cursor }) => {
        const db = (0, index_1.getDatabase)();
        const params = [];
        let sql = `
        SELECT *
        FROM events
        WHERE userToken = ?
    `;
        params.push(userToken);
        if (cursor) {
            sql += ` AND date < ?`;
            params.push(cursor);
        }
        sql += ` ORDER BY date DESC LIMIT ?`;
        params.push(limit);
        return db.prepare(sql).all(params).map(marshalEventLogEntry);
    },
    logEvent: (payload) => {
        const db = (0, index_1.getDatabase)();
        db.prepare(`
          INSERT INTO events(date, ip, type, model, family, hashes, userToken, inputTokens, outputTokens)
          VALUES (:date, :ip, :type, :model, :family, :hashes, :userToken, :inputTokens, :outputTokens)
      `).run({
            date: payload.date,
            ip: payload.ip,
            type: payload.type,
            model: payload.model,
            family: payload.family,
            hashes: payload.hashes.join(","),
            userToken: payload.userToken,
            inputTokens: payload.inputTokens,
            outputTokens: payload.outputTokens,
        });
    },
};
function marshalEventLogEntry(row) {
    return {
        date: row.date,
        ip: row.ip,
        type: row.type,
        model: row.model,
        family: row.family,
        hashes: row.hashes.split(","),
        userToken: row.userToken,
        inputTokens: parseInt(row.inputTokens),
        outputTokens: parseInt(row.outputTokens),
    };
}
//# sourceMappingURL=event.js.map
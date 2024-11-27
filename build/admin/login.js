"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginRouter = void 0;
const express_1 = require("express");
const loginRouter = (0, express_1.Router)();
exports.loginRouter = loginRouter;
loginRouter.get("/login", (_req, res) => {
    res.render("admin_login");
});
loginRouter.post("/login", (req, res) => {
    req.session.adminToken = req.body.token;
    res.redirect("/admin");
});
loginRouter.get("/logout", (req, res) => {
    delete req.session.adminToken;
    res.redirect("/admin/login");
});
loginRouter.get("/", (req, res) => {
    if (req.session.adminToken) {
        return res.redirect("/admin/manage");
    }
    res.redirect("/admin/login");
});
//# sourceMappingURL=login.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryableError = exports.TooManyRequestsError = exports.NotFoundError = exports.ForbiddenError = exports.PaymentRequiredError = exports.BadRequestError = exports.HttpError = void 0;
class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = "HttpError";
    }
}
exports.HttpError = HttpError;
class BadRequestError extends HttpError {
    constructor(message) {
        super(400, message);
    }
}
exports.BadRequestError = BadRequestError;
class PaymentRequiredError extends HttpError {
    constructor(message) {
        super(402, message);
    }
}
exports.PaymentRequiredError = PaymentRequiredError;
class ForbiddenError extends HttpError {
    constructor(message) {
        super(403, message);
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends HttpError {
    constructor(message) {
        super(404, message);
    }
}
exports.NotFoundError = NotFoundError;
class TooManyRequestsError extends HttpError {
    constructor(message) {
        super(429, message);
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
class RetryableError extends Error {
    constructor(message) {
        super(message);
        this.name = "RetryableError";
    }
}
exports.RetryableError = RetryableError;
//# sourceMappingURL=errors.js.map
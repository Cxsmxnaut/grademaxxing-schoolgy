/** Deliberately omits response bodies, URLs, headers and credentials. */
export class SchoologyError extends Error {
    code;
    status;
    retryAfterSeconds;
    constructor(code, message, status, retryAfterSeconds) {
        super(message);
        this.code = code;
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
        this.name = 'SchoologyError';
    }
}
//# sourceMappingURL=errors.js.map
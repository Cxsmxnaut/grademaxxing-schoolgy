export type ErrorCode = 'AUTH' | 'PERMISSION' | 'RATE_LIMIT' | 'HTTP' | 'NETWORK' | 'TIMEOUT' | 'RESPONSE' | 'URL' | 'PAGINATION';
/** Deliberately omits response bodies, URLs, headers and credentials. */
export declare class SchoologyError extends Error {
    readonly code: ErrorCode;
    readonly status?: number | undefined;
    readonly retryAfterSeconds?: number | undefined;
    constructor(code: ErrorCode, message: string, status?: number | undefined, retryAfterSeconds?: number | undefined);
}

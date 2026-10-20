import type { AuthorizationStart, ConnectorOptions, OAuthToken, PendingAuthorization } from './types.js';
export declare class SchoologyOAuth {
    #private;
    constructor(options: Omit<ConnectorOptions, 'token'>);
    beginAuthorization(returnUrl: string): Promise<AuthorizationStart>;
    /** Caller must atomically consume a session-bound pending record once, even on failure. */
    completeAuthorization(pending: PendingAuthorization, returnedUrl: string): Promise<OAuthToken>;
}

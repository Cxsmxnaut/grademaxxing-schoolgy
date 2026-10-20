import type { Credentials, OAuthToken } from './types.js';
/** RFC 5849 HMAC-SHA1. Uses Web Crypto, so no Node-only runtime dependency. */
export declare function signOAuth(url: URL, consumer: Credentials, token?: OAuthToken, extra?: Record<string, string>, clock?: {
    nonce: string;
    timestamp: string;
}): Promise<string>;

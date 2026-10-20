import type { ConnectorOptions, OAuthToken, Query, RawRecord } from './types.js';
export declare function secureUrl(value: string): URL;
export declare function record(value: unknown): RawRecord;
export declare function records(value: unknown): RawRecord[];
export declare class Transport {
    #private;
    readonly base: URL;
    constructor(options: ConnectorOptions);
    resolve(path: string, current?: URL): URL;
    request(path: string | URL, query?: Query, token?: OAuthToken, extra?: Record<string, string>): Promise<Response>;
    json(path: string, query?: Query): Promise<RawRecord>;
    list(path: string, key: string, query?: Query): Promise<RawRecord[]>;
}

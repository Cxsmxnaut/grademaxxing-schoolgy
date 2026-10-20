import { SchoologyError } from './errors.js';
import { signOAuth } from './oauth.js';
export function secureUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new SchoologyError('URL', 'Invalid URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new SchoologyError('URL', 'An HTTPS URL without embedded credentials or fragments is required.');
    return url;
}
export function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new SchoologyError('RESPONSE', 'Expected a Schoology JSON object.');
    return value;
}
export function records(value) {
    if (value == null)
        return [];
    return (Array.isArray(value) ? value : [value]).map(record);
}
export class Transport {
    #options;
    base;
    constructor(options) {
        if (!options.consumer.key ||
            !options.consumer.secret ||
            (options.token && (!options.token.key || !options.token.secret)))
            throw new SchoologyError('AUTH', 'Both the key and secret are required.');
        // Copy credentials so later caller mutations cannot affect concurrent requests.
        this.#options = {
            ...options,
            consumer: { ...options.consumer },
            ...(options.token ? { token: { ...options.token } } : {})
        };
        this.base = secureUrl(options.apiBase ?? 'https://api.schoology.com/v1/');
        if (this.base.search)
            throw new SchoologyError('URL', 'API base must not contain a query.');
        if (!this.base.pathname.endsWith('/'))
            this.base.pathname += '/';
        for (const number of [options.timeoutMs ?? 15_000, options.maxPages ?? 100])
            if (!Number.isInteger(number) || number < 1)
                throw new RangeError('Limits must be positive integers.');
    }
    resolve(path, current = this.base) {
        const url = new URL(path, current);
        // Historical API documentation and responses sometimes use HTTP links.
        if (url.protocol === 'http:' && url.host === this.base.host)
            url.protocol = 'https:';
        secureUrl(url.href);
        if (url.origin !== this.base.origin ||
            !url.pathname.startsWith(this.base.pathname) ||
            [...url.searchParams.keys()].some((key) => key.startsWith('oauth_')))
            throw new SchoologyError('URL', 'Schoology link leaves the configured API boundary.');
        return url;
    }
    async request(path, query = {}, token, extra = {}) {
        let url = this.resolve(String(path));
        for (const [key, value] of Object.entries(query))
            if (value !== undefined)
                url.searchParams.set(key, String(value));
        url = this.resolve(url.href);
        const timeout = AbortSignal.timeout(this.#options.timeoutMs ?? 15_000);
        for (let redirects = 0; redirects <= 3; redirects++) {
            const authorization = await signOAuth(url, this.#options.consumer, token ?? this.#options.token, extra);
            let response;
            try {
                response = await (this.#options.fetch ?? globalThis.fetch)(url, {
                    method: 'GET',
                    headers: { Authorization: authorization, Accept: 'application/json' },
                    redirect: 'manual',
                    signal: timeout,
                    cache: 'no-store'
                });
            }
            catch {
                throw new SchoologyError(timeout.aborted ? 'TIMEOUT' : 'NETWORK', timeout.aborted ? 'Schoology request timed out.' : 'Schoology request failed.');
            }
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get('location');
                if (!location || redirects === 3)
                    throw new SchoologyError('HTTP', 'Invalid or excessive API redirects.', response.status);
                url = this.resolve(location, url); // Re-sign trusted redirects, including /users/me -> /users/{id}.
                continue;
            }
            if (!response.ok) {
                const code = response.status === 401
                    ? 'AUTH'
                    : response.status === 403
                        ? 'PERMISSION'
                        : response.status === 429
                            ? 'RATE_LIMIT'
                            : 'HTTP';
                const retry = response.headers.get('retry-after');
                const parsed = retry
                    ? /^\d+$/.test(retry)
                        ? Number(retry)
                        : Math.ceil((Date.parse(retry) - Date.now()) / 1000)
                    : NaN;
                throw new SchoologyError(code, `Schoology returned HTTP ${response.status}.`, response.status, Number.isFinite(parsed) ? Math.max(0, parsed) : undefined);
            }
            return response;
        }
        throw new SchoologyError('HTTP', 'Too many redirects.');
    }
    async json(path, query = {}) {
        const response = await this.request(path, query);
        try {
            return record(await response.json());
        }
        catch {
            throw new SchoologyError('RESPONSE', 'Schoology did not return a JSON object.');
        }
    }
    async list(path, key, query = {}) {
        let url = this.resolve(path);
        for (const [name, value] of Object.entries({ limit: 100, ...query }))
            if (value !== undefined)
                url.searchParams.set(name, String(value));
        const seen = new Set();
        const result = [];
        for (let page = 0; page < (this.#options.maxPages ?? 100); page++) {
            if (seen.has(url.href))
                throw new SchoologyError('PAGINATION', 'Schoology pagination repeated a page.');
            seen.add(url.href);
            const data = await this.json(url.href);
            if (!(key in data))
                throw new SchoologyError('RESPONSE', `Schoology response is missing the ${key} collection.`);
            result.push(...records(data[key]));
            const next = data.links == null ? undefined : record(data.links).next;
            if (next == null || next === '')
                return result;
            if (typeof next !== 'string')
                throw new SchoologyError('RESPONSE', 'Invalid pagination link.');
            url = this.resolve(next, url);
        }
        throw new SchoologyError('PAGINATION', 'Schoology pagination exceeded the configured limit.');
    }
}
//# sourceMappingURL=transport.js.map
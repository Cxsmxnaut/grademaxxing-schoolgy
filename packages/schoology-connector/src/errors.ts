export type ErrorCode =
	| 'AUTH'
	| 'PERMISSION'
	| 'RATE_LIMIT'
	| 'HTTP'
	| 'NETWORK'
	| 'TIMEOUT'
	| 'RESPONSE'
	| 'URL'
	| 'PAGINATION';

/** Deliberately omits response bodies, URLs, headers and credentials. */
export class SchoologyError extends Error {
	constructor(
		public readonly code: ErrorCode,
		message: string,
		public readonly status?: number,
		public readonly retryAfterSeconds?: number
	) {
		super(message);
		this.name = 'SchoologyError';
	}
}

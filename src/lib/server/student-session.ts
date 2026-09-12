import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { Pxp2Client, type Pxp2SessionState } from './pxp2';

const SESSION_TTL_MS =
	positiveIntegerEnvironment('GRADEMAXXING_SESSION_TTL_HOURS', 12, 24) * 60 * 60 * 1000;
const MAX_QUEUED_OPERATIONS_PER_SESSION = 12;
const MAX_ACTIVE_OPERATIONS = positiveIntegerEnvironment(
	'GRADEMAXXING_MAX_ACTIVE_OPERATIONS',
	96,
	1_024
);
const MAX_QUEUED_OPERATIONS = positiveIntegerEnvironment(
	'GRADEMAXXING_MAX_QUEUED_OPERATIONS',
	1_000,
	20_000
);
const OPERATION_QUEUE_TIMEOUT_MS = positiveIntegerEnvironment(
	'GRADEMAXXING_OPERATION_QUEUE_TIMEOUT_MS',
	30_000,
	120_000
);

const SESSION_TOKEN_VERSION = 'v1';
const SESSION_TOKEN_AAD = Buffer.from('grademaxxing-student-session-v1');
const MAX_SESSION_TOKEN_BYTES = 3_500;
const MAX_SESSION_PAYLOAD_BYTES = 32 * 1024;

export type StudentSession = {
	client: Pxp2Client;
	clientSessionId: string;
	username: string;
	domain: string;
	expiresAt: number;
	operationTail: Promise<void>;
	queuedOperations: number;
};

type StoredStudentSession = {
	v: 1;
	client: Pxp2SessionState;
	clientSessionId: string;
	username: string;
	domain: string;
	expiresAt: number;
};

export class StudentSessionBusyError extends Error {}
export class StudentSessionCapacityError extends Error {}
export class StudentServiceBusyError extends Error {}
export class StudentOperationAbortedError extends Error {}
export class StudentSessionConfigurationError extends Error {}

type OperationWaiter = {
	resolve: (release: () => void) => void;
	reject: (cause: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	signal?: AbortSignal;
	abort?: () => void;
};

/**
 * Bounds work shared by every student without coupling one student's session to
 * another. A slot covers a complete logical portal operation, which prevents a
 * school-wide refresh spike from turning into unbounded outbound requests.
 */
export class StudentOperationGate {
	private active = 0;
	private readonly waiters: OperationWaiter[] = [];

	constructor(
		private readonly maximumActive: number,
		private readonly maximumQueued: number,
		private readonly queueTimeoutMs = 30_000
	) {
		if (!Number.isSafeInteger(maximumActive) || maximumActive < 1)
			throw new Error('maximumActive must be a positive integer.');
		if (!Number.isSafeInteger(maximumQueued) || maximumQueued < 0)
			throw new Error('maximumQueued must be a non-negative integer.');
		if (!Number.isSafeInteger(queueTimeoutMs) || queueTimeoutMs < 1)
			throw new Error('queueTimeoutMs must be a positive integer.');
	}

	async run<T>(operation: () => Promise<T> | T, signal?: AbortSignal): Promise<T> {
		const release = await this.acquire(signal);
		try {
			if (signal?.aborted) throw new StudentOperationAbortedError('The request was cancelled.');
			return await operation();
		} finally {
			release();
		}
	}

	metrics() {
		return { active: this.active, queued: this.waiters.length };
	}

	private acquire(signal?: AbortSignal): Promise<() => void> {
		if (signal?.aborted)
			return Promise.reject(new StudentOperationAbortedError('The request was cancelled.'));
		if (this.active < this.maximumActive) {
			this.active += 1;
			return Promise.resolve(() => this.release());
		}
		if (this.waiters.length >= this.maximumQueued)
			return Promise.reject(
				new StudentServiceBusyError(
					'The StudentVUE service is handling unusually high traffic. Please try again shortly.'
				)
			);
		return new Promise((resolve, reject) => {
			const waiter: OperationWaiter = {
				resolve,
				reject,
				signal,
				timeout: setTimeout(() => {
					this.removeWaiter(
						waiter,
						new StudentServiceBusyError(
							'The StudentVUE service is still busy. Please try again shortly.'
						)
					);
				}, this.queueTimeoutMs)
			};
			if (signal) {
				waiter.abort = () =>
					this.removeWaiter(waiter, new StudentOperationAbortedError('The request was cancelled.'));
				signal.addEventListener('abort', waiter.abort, { once: true });
			}
			this.waiters.push(waiter);
		});
	}

	private release() {
		while (this.waiters.length > 0) {
			const next = this.waiters.shift()!;
			this.cleanupWaiter(next);
			if (next.signal?.aborted) {
				next.reject(new StudentOperationAbortedError('The request was cancelled.'));
				continue;
			}
			next.resolve(() => this.release());
			return;
		}
		this.active = Math.max(0, this.active - 1);
	}

	private removeWaiter(waiter: OperationWaiter, cause: Error) {
		const index = this.waiters.indexOf(waiter);
		if (index === -1) return;
		this.waiters.splice(index, 1);
		this.cleanupWaiter(waiter);
		waiter.reject(cause);
	}

	private cleanupWaiter(waiter: OperationWaiter) {
		clearTimeout(waiter.timeout);
		if (waiter.signal && waiter.abort) waiter.signal.removeEventListener('abort', waiter.abort);
	}
}

const operationGate = new StudentOperationGate(
	MAX_ACTIVE_OPERATIONS,
	MAX_QUEUED_OPERATIONS,
	OPERATION_QUEUE_TIMEOUT_MS
);

export async function createStudentSession(
	districtUrl: string,
	username: string,
	password: string
) {
	const client = await Pxp2Client.login(districtUrl, { username, password });
	const clientSessionId = randomUUID();
	const domain = new URL(districtUrl.includes('://') ? districtUrl : `https://${districtUrl}`).host;
	const session: StudentSession = {
		client,
		clientSessionId,
		username,
		domain,
		expiresAt: Date.now() + SESSION_TTL_MS,
		operationTail: Promise.resolve(),
		queuedOperations: 0
	};
	const token = serializeStudentSession(session);
	return { token, clientSessionId, username, domain };
}

export function getStudentSession(token: string | undefined) {
	if (!token) throw new Error('Sign in to StudentVUE first.');
	try {
		const stored = decryptStoredSession(token);
		if (stored.expiresAt <= Date.now())
			throw new Error('Your StudentVUE session has expired. Please sign in again.');
		return {
			client: Pxp2Client.resume(stored.client),
			clientSessionId: stored.clientSessionId,
			username: stored.username,
			domain: stored.domain,
			expiresAt: Date.now() + SESSION_TTL_MS,
			operationTail: Promise.resolve(),
			queuedOperations: 0
		} satisfies StudentSession;
	} catch (cause) {
		if (cause instanceof StudentSessionConfigurationError) throw cause;
		throw new Error('Your StudentVUE session has expired. Please sign in again.', { cause });
	}
}

export function serializeStudentSession(session: StudentSession) {
	const stored: StoredStudentSession = {
		v: 1,
		client: session.client.exportSessionState(),
		clientSessionId: session.clientSessionId,
		username: session.username,
		domain: session.domain,
		expiresAt: session.expiresAt
	};
	const compressed = deflateRawSync(Buffer.from(JSON.stringify(stored)), { level: 9 });
	if (compressed.byteLength > MAX_SESSION_PAYLOAD_BYTES)
		throw new StudentSessionCapacityError('The StudentVUE session is too large to store securely.');
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', sessionEncryptionKey(), iv);
	cipher.setAAD(SESSION_TOKEN_AAD);
	const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
	const token = [
		SESSION_TOKEN_VERSION,
		iv.toString('base64url'),
		encrypted.toString('base64url'),
		cipher.getAuthTag().toString('base64url')
	].join('.');
	if (Buffer.byteLength(token) > MAX_SESSION_TOKEN_BYTES)
		throw new StudentSessionCapacityError('The StudentVUE session is too large to store securely.');
	return token;
}

// Stateless encrypted sessions are invalidated by deleting the browser cookie.
// No StudentVUE password is included in the token or retained after login.
export function deleteStudentSession(_token: string | undefined) {}

export function requireStudentSessionContext(
	session: StudentSession,
	clientSessionId: string | null
) {
	if (!clientSessionId || clientSessionId !== session.clientSessionId)
		throw new Error('This browser tab belongs to a different StudentVUE session. Sign in again.');
}

export async function runStudentOperation<T>(
	session: StudentSession,
	operation: () => Promise<T> | T,
	signal?: AbortSignal
): Promise<T> {
	if (session.queuedOperations >= MAX_QUEUED_OPERATIONS_PER_SESSION)
		throw new StudentSessionBusyError(
			'Too many StudentVUE requests are already queued. Please try again shortly.'
		);

	session.queuedOperations += 1;
	const previous = session.operationTail;
	let release!: () => void;
	session.operationTail = new Promise<void>((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		if (signal?.aborted) throw new StudentOperationAbortedError('The request was cancelled.');
		return await operationGate.run(operation, signal);
	} finally {
		session.queuedOperations -= 1;
		release();
	}
}

function positiveIntegerEnvironment(name: string, fallback: number, maximum: number) {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return fallback;
	if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer.`);
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
		throw new Error(`${name} must be between 1 and ${maximum}.`);
	return value;
}

let developmentSessionKey: Buffer | undefined;

function sessionEncryptionKey() {
	const configured = process.env.GRADEMAXXING_SESSION_SECRET;
	if (!configured) {
		if (process.env.NODE_ENV === 'production')
			throw new StudentSessionConfigurationError(
				'GRADEMAXXING_SESSION_SECRET must be configured in production.'
			);
		developmentSessionKey ??= randomBytes(32);
		return developmentSessionKey;
	}
	if (configured.length < 32)
		throw new StudentSessionConfigurationError(
			'GRADEMAXXING_SESSION_SECRET must contain at least 32 characters.'
		);
	return createHash('sha256').update(configured, 'utf8').digest();
}

function decryptStoredSession(token: string): StoredStudentSession {
	if (Buffer.byteLength(token) > MAX_SESSION_TOKEN_BYTES)
		throw new Error('Session token is too large.');
	const [version, encodedIv, encodedCiphertext, encodedTag, extra] = token.split('.');
	if (
		version !== SESSION_TOKEN_VERSION ||
		extra !== undefined ||
		!encodedIv ||
		!encodedCiphertext ||
		!encodedTag ||
		![encodedIv, encodedCiphertext, encodedTag].every((part) => /^[A-Za-z0-9_-]+$/.test(part))
	)
		throw new Error('Session token format is invalid.');
	const iv = decodeCanonicalBase64Url(encodedIv);
	const ciphertext = decodeCanonicalBase64Url(encodedCiphertext);
	const tag = decodeCanonicalBase64Url(encodedTag);
	if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength === 0)
		throw new Error('Session token format is invalid.');
	const decipher = createDecipheriv('aes-256-gcm', sessionEncryptionKey(), iv);
	decipher.setAAD(SESSION_TOKEN_AAD);
	decipher.setAuthTag(tag);
	const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	const decoded = inflateRawSync(compressed, { maxOutputLength: MAX_SESSION_PAYLOAD_BYTES });
	const parsed = JSON.parse(decoded.toString('utf8')) as Partial<StoredStudentSession>;
	if (
		parsed.v !== 1 ||
		!parsed.client ||
		typeof parsed.clientSessionId !== 'string' ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			parsed.clientSessionId
		) ||
		typeof parsed.username !== 'string' ||
		!parsed.username ||
		parsed.username.length > 254 ||
		typeof parsed.domain !== 'string' ||
		!parsed.domain ||
		parsed.domain.length > 253 ||
		typeof parsed.expiresAt !== 'number' ||
		!Number.isSafeInteger(parsed.expiresAt)
	)
		throw new Error('Session token payload is invalid.');
	return parsed as StoredStudentSession;
}

function decodeCanonicalBase64Url(value: string) {
	const decoded = Buffer.from(value, 'base64url');
	if (decoded.toString('base64url') !== value)
		throw new Error('Session token encoding is invalid.');
	return decoded;
}

// The __Host- prefix makes production browsers reject cookies that are not
// Secure, host-only, and scoped to the root path.
export const sessionCookie =
	process.env.NODE_ENV === 'production' ? '__Host-grademaxxing_session' : 'grademaxxing_session';
export const sessionMaxAge = SESSION_TTL_MS / 1000;
export const clientSessionHeader = 'x-grademaxxing-session';

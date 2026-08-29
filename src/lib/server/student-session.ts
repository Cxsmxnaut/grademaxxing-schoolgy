import { randomUUID } from 'node:crypto';
import { Pxp2Client } from './pxp2';

const SESSION_TTL_MS =
	positiveIntegerEnvironment('GRADEMAXXING_SESSION_TTL_HOURS', 12, 24) * 60 * 60 * 1000;
const MAX_SESSIONS = positiveIntegerEnvironment('GRADEMAXXING_MAX_SESSIONS', 5_000, 50_000);
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

type StudentSession = {
	client: Pxp2Client;
	clientSessionId: string;
	username: string;
	domain: string;
	expiresAt: number;
	operationTail: Promise<void>;
	queuedOperations: number;
};

export class StudentSessionBusyError extends Error {}
export class StudentSessionCapacityError extends Error {}
export class StudentServiceBusyError extends Error {}
export class StudentOperationAbortedError extends Error {}

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

const sessions = new Map<string, StudentSession>();
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
	pruneSessions();
	if (sessions.size >= MAX_SESSIONS)
		throw new StudentSessionCapacityError(
			'The server is at its active session limit. Please try again shortly.'
		);
	const client = await Pxp2Client.login(districtUrl, { username, password });
	const token = randomUUID();
	const clientSessionId = randomUUID();
	const domain = new URL(districtUrl.includes('://') ? districtUrl : `https://${districtUrl}`).host;
	sessions.set(token, {
		client,
		clientSessionId,
		username,
		domain,
		expiresAt: Date.now() + SESSION_TTL_MS,
		operationTail: Promise.resolve(),
		queuedOperations: 0
	});
	return { token, clientSessionId, username, domain };
}

export function getStudentSession(token: string | undefined) {
	pruneSessions();
	if (!token) throw new Error('Sign in to StudentVUE first.');
	const session = sessions.get(token);
	if (!session || session.expiresAt <= Date.now()) {
		sessions.delete(token);
		throw new Error('Your StudentVUE session has expired. Please sign in again.');
	}
	session.expiresAt = Date.now() + SESSION_TTL_MS;
	return session;
}

export function deleteStudentSession(token: string | undefined) {
	if (token) sessions.delete(token);
}

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

function pruneSessions() {
	const now = Date.now();
	for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
}

// The __Host- prefix makes production browsers reject cookies that are not
// Secure, host-only, and scoped to the root path.
export const sessionCookie =
	process.env.NODE_ENV === 'production' ? '__Host-grademaxxing_session' : 'grademaxxing_session';
export const sessionMaxAge = SESSION_TTL_MS / 1000;
export const clientSessionHeader = 'x-grademaxxing-session';

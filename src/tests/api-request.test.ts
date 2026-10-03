import { acc } from '$lib/account.svelte';
import { clearStoredCredentials, loadStoredCredentials } from '$lib/auth/credential-vault';
import {
	beginSessionRecovery,
	portalConnection,
	resetPortalConnection,
	sessionRecovery
} from '$lib/session.svelte';
import { refreshGradesAfterSessionRestore as refreshGradebookAfterSessionRestore } from '$lib/studentvue/session-recovery';
import { apiRequest, StudentAccount, StudentVueSessionExpiredError } from '$lib/synergy';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('$lib/auth/credential-vault', () => ({
	loadStoredCredentials: vi.fn(),
	clearStoredCredentials: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/studentvue/session-recovery', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/studentvue/session-recovery')>()),
	refreshGradesAfterSessionRestore: vi.fn().mockResolvedValue(true)
}));

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
	vi.mocked(refreshGradebookAfterSessionRestore).mockResolvedValue(true);
	vi.unstubAllGlobals();
	resetPortalConnection();
	acc.studentAccount = undefined;
});

test('idempotent API reads recover from a transient upstream failure', async () => {
	vi.useFakeTimers();
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(
			Response.json({ message: 'temporary' }, { status: 502, statusText: 'Bad Gateway' })
		)
		.mockResolvedValueOnce(Response.json({ value: 'recovered' }));
	vi.stubGlobal('fetch', fetchMock);

	const resultPromise = apiRequest<{ value: string }>('/api/studentvue/gradebook');
	await vi.runAllTimersAsync();
	await expect(resultPromise).resolves.toEqual({ value: 'recovered' });
	expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('idempotent API reads recover from one transient server error', async () => {
	vi.useFakeTimers();
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(Response.json({ message: 'temporary' }, { status: 500 }))
		.mockResolvedValueOnce(Response.json({ value: 'recovered' }));
	vi.stubGlobal('fetch', fetchMock);

	const result = apiRequest<{ value: string }>('/api/studentvue/gradebook');
	await vi.runAllTimersAsync();
	await expect(result).resolves.toEqual({ value: 'recovered' });
	expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('non-idempotent API writes are never automatically repeated', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValue(Response.json({ message: 'temporary' }, { status: 503 }));
	vi.stubGlobal('fetch', fetchMock);

	await expect(apiRequest('/api/session', { method: 'POST', body: '{}' }, false)).rejects.toThrow(
		'temporary'
	);
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('retryable reads honor a bounded Retry-After response', async () => {
	vi.useFakeTimers();
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(
			Response.json({ message: 'busy' }, { status: 503, headers: { 'Retry-After': '1' } })
		)
		.mockResolvedValueOnce(Response.json({ value: 'ready' }));
	vi.stubGlobal('fetch', fetchMock);

	const result = apiRequest<{ value: string }>('/api/studentvue/gradebook');
	await vi.advanceTimersByTimeAsync(999);
	expect(fetchMock).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	await expect(result).resolves.toEqual({ value: 'ready' });
	expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('upstream expiry is distinguished from an invalid app session', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>().mockResolvedValue(
			Response.json(
				{
					code: 'UPSTREAM_SESSION_EXPIRED',
					message: 'Reconnect to StudentVUE to update your school data.'
				},
				{ status: 401 }
			)
		)
	);

	await expect(apiRequest('/api/studentvue/gradebook')).rejects.toBeInstanceOf(
		StudentVueSessionExpiredError
	);
});

test('active StudentVUE requests silently re-authenticate with saved device credentials', async () => {
	const localStorage = new Map<string, string>([
		[
			'token',
			JSON.stringify({
				username: 'student@example.com',
				domain: 'https://district.test',
				sessionId: 'old'
			})
		]
	]);
	vi.stubGlobal('window', {
		localStorage: {
			getItem: (key: string) => localStorage.get(key) ?? null,
			setItem: (key: string, value: string) => localStorage.set(key, value)
		}
	});
	vi.mocked(loadStoredCredentials).mockResolvedValue({
		domain: 'https://district.test',
		username: 'student@example.com',
		password: 'saved-password'
	});
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(
			Response.json({ code: 'UPSTREAM_SESSION_EXPIRED', message: 'expired' }, { status: 401 })
		)
		.mockResolvedValueOnce(
			Response.json({
				username: 'student@example.com',
				domain: 'https://district.test',
				sessionId: 'new'
			})
		)
		.mockResolvedValueOnce(Response.json({ xml: '<Gradebook />', detailed: false }));
	vi.stubGlobal('fetch', fetchMock);

	const account = new StudentAccount('https://district.test', 'student@example.com', '', 'old');
	acc.studentAccount = account;
	const response = await account.gradebookRequest();

	expect(response.headers.get('X-Grademaxxing-Gradebook-Detail')).toBe('false');
	expect(account.sessionId).toBe('new');
	expect(JSON.parse(localStorage.get('token') ?? '{}')).toMatchObject({ sessionId: 'new' });
	expect(portalConnection.state).toBe('connected');
	expect(fetchMock).toHaveBeenCalledTimes(3);
	expect(refreshGradebookAfterSessionRestore).toHaveBeenCalledExactlyOnceWith(account);
	expect(sessionRecovery.active).toBe(false);
});

test('every explicit refresh fetches full grades with the selected period and bypasses HTTP cache', async () => {
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(Response.json({ xml: '<Gradebook value="first" />', detailed: true }))
		.mockResolvedValueOnce(Response.json({ xml: '<Gradebook value="second" />', detailed: true }));
	vi.stubGlobal('fetch', fetchMock);
	const account = new StudentAccount('https://district.test', 'synthetic-student', '', 'session');
	acc.studentAccount = account;

	await account.gradebookRequest(1, true, true);
	const second = await account.gradebookRequest(1, false, true);

	expect(fetchMock).toHaveBeenCalledTimes(2);
	for (const [path, init] of fetchMock.mock.calls) {
		expect(path).toBe('/api/studentvue/gradebook?reportPeriod=1&fresh=true');
		expect(init?.cache).toBe('no-store');
	}
	expect(await second.text()).toContain('second');
});

test('silent vault recovery holds its loading state through the fresh grade pass without recursive waits', async () => {
	const storage = new Map<string, string>([
		[
			'token',
			JSON.stringify({ username: 'synthetic-student', domain: 'district.test', sessionId: 'old' })
		]
	]);
	vi.stubGlobal('window', {
		localStorage: {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value)
		}
	});
	vi.mocked(loadStoredCredentials).mockResolvedValue({
		domain: 'district.test',
		username: 'synthetic-student',
		password: 'synthetic-password'
	});
	const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (path) => {
		if (path === '/api/session')
			return Response.json({
				username: 'synthetic-student',
				domain: 'district.test',
				sessionId: 'new'
			});
		if (fetchMock.mock.calls.length === 1)
			return Response.json({ code: 'UPSTREAM_SESSION_EXPIRED' }, { status: 401 });
		return Response.json({ xml: '<Gradebook />', detailed: true });
	});
	vi.stubGlobal('fetch', fetchMock);
	let releaseGrades!: () => void;
	const gradeGate = new Promise<void>((resolve) => {
		releaseGrades = resolve;
	});
	let reachedFreshPass!: () => void;
	const freshPassStarted = new Promise<void>((resolve) => {
		reachedFreshPass = resolve;
	});
	const account = new StudentAccount('district.test', 'synthetic-student', '', 'old');
	acc.studentAccount = account;
	vi.mocked(refreshGradebookAfterSessionRestore).mockImplementationOnce(async () => {
		reachedFreshPass();
		await gradeGate;
		await account.gradebookRequest(undefined, false, true);
		return true;
	});
	let completed = false;
	const result = account.gradebookRequest().then((value) => {
		completed = true;
		return value;
	});
	await freshPassStarted;
	expect(sessionRecovery).toMatchObject({ active: true, stage: 'refreshing' });
	expect(completed).toBe(false);
	releaseGrades();
	await result;
	expect(sessionRecovery.active).toBe(false);
	expect(fetchMock).toHaveBeenCalledTimes(4);
	expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/studentvue/gradebook?fresh=true');
	expect(account.sessionId).toBe('new');
});

test('a failed post-recovery grade pass retains the newly authenticated session', async () => {
	const storage = new Map<string, string>([['token', JSON.stringify({ sessionId: 'old' })]]);
	vi.stubGlobal('window', {
		localStorage: {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value)
		}
	});
	vi.mocked(loadStoredCredentials).mockResolvedValue({
		domain: 'district.test',
		username: 'synthetic-student',
		password: 'synthetic-password'
	});
	vi.mocked(refreshGradebookAfterSessionRestore).mockRejectedValueOnce(
		new Error('Portal unavailable')
	);
	vi.stubGlobal(
		'fetch',
		vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ code: 'UPSTREAM_SESSION_EXPIRED' }, { status: 401 }))
			.mockResolvedValueOnce(
				Response.json({ username: 'synthetic-student', domain: 'district.test', sessionId: 'new' })
			)
			.mockResolvedValueOnce(Response.json({ signedIn: true, updatedAt: 1 }))
	);
	const account = new StudentAccount('district.test', 'synthetic-student', '', 'old');
	acc.studentAccount = account;
	await account.keepAlive();
	expect(account.sessionId).toBe('new');
	expect(sessionRecovery.active).toBe(false);
	expect(portalConnection.state).not.toBe('reconnect');
});

test('upstream expiry shows reconnect only after saved device recovery fails', async () => {
	const localStorage = new Map<string, string>([['token', JSON.stringify({ sessionId: 'old' })]]);
	vi.stubGlobal('window', {
		localStorage: {
			getItem: (key: string) => localStorage.get(key) ?? null,
			setItem: (key: string, value: string) => localStorage.set(key, value)
		}
	});
	vi.mocked(loadStoredCredentials).mockResolvedValue(undefined);
	vi.stubGlobal(
		'fetch',
		vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				Response.json({ code: 'UPSTREAM_SESSION_EXPIRED', message: 'expired' }, { status: 401 })
			)
	);

	const account = new StudentAccount('https://district.test', 'student@example.com', '', 'old');
	acc.studentAccount = account;
	await expect(account.gradebookRequest()).rejects.toBeInstanceOf(StudentVueSessionExpiredError);
	expect(portalConnection.state).toBe('reconnect');
});

function activeSyntheticAccount() {
	const storage = new Map<string, string>([['token', JSON.stringify({ sessionId: 'old' })]]);
	const assign = vi.fn();
	vi.stubGlobal('window', {
		localStorage: {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key)
		},
		location: { assign }
	});
	const account = new StudentAccount('district.test', 'synthetic-student', '', 'old');
	acc.studentAccount = account;
	return { account, storage, assign };
}

test('an invalid app session uses the matching vault before any sign-in navigation', async () => {
	const { account, assign, storage } = activeSyntheticAccount();
	vi.mocked(loadStoredCredentials).mockResolvedValue({
		domain: 'district.test',
		username: 'synthetic-student',
		password: 'synthetic-password'
	});
	vi.stubGlobal(
		'fetch',
		vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ code: 'APP_SESSION_INVALID' }, { status: 401 }))
			.mockResolvedValueOnce(
				Response.json({ username: 'synthetic-student', domain: 'district.test', sessionId: 'new' })
			)
			.mockResolvedValueOnce(Response.json({ signedIn: true, updatedAt: 1 }))
	);
	await account.keepAlive();
	expect(assign).not.toHaveBeenCalled();
	expect(JSON.parse(storage.get('token') ?? '{}').sessionId).toBe('new');
	expect(refreshGradebookAfterSessionRestore).toHaveBeenCalledExactlyOnceWith(account);
});

test('account switching during vault lookup cancels the old account recovery before login', async () => {
	const { account, storage, assign } = activeSyntheticAccount();
	let releaseVault!: (value: Awaited<ReturnType<typeof loadStoredCredentials>>) => void;
	let lookupStarted!: () => void;
	const lookup = new Promise<void>((resolve) => {
		lookupStarted = resolve;
	});
	vi.mocked(loadStoredCredentials).mockImplementationOnce(() => {
		lookupStarted();
		return new Promise((resolve) => {
			releaseVault = resolve;
		});
	});
	const fetchMock = vi
		.fn<typeof fetch>()
		.mockResolvedValue(Response.json({ code: 'UPSTREAM_SESSION_EXPIRED' }, { status: 401 }));
	vi.stubGlobal('fetch', fetchMock);
	const result = account.gradebookRequest();
	const rejection = expect(result).rejects.toBeInstanceOf(StudentVueSessionExpiredError);
	await lookup;
	acc.studentAccount = new StudentAccount('district.test', 'other-synthetic-student', '', 'other');
	storage.set('token', JSON.stringify({ sessionId: 'other' }));
	releaseVault({
		domain: 'district.test',
		username: 'synthetic-student',
		password: 'synthetic-password'
	});
	await rejection;
	expect(fetchMock).toHaveBeenCalledTimes(1);
	expect(refreshGradebookAfterSessionRestore).not.toHaveBeenCalled();
	expect(assign).not.toHaveBeenCalled();
	expect(portalConnection.state).not.toBe('reconnect');
});

test('logout aborts vault login and ignores a late successful authentication response', async () => {
	const { account, storage, assign } = activeSyntheticAccount();
	vi.mocked(loadStoredCredentials).mockResolvedValue({
		domain: 'district.test',
		username: 'synthetic-student',
		password: 'synthetic-password'
	});
	let releaseLogin!: () => void;
	let authSignal: AbortSignal | undefined;
	let loginStarted!: () => void;
	const login = new Promise<void>((resolve) => {
		loginStarted = resolve;
	});
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
			if (path === '/api/session') {
				authSignal = init?.signal ?? undefined;
				loginStarted();
				await new Promise<void>((resolve) => {
					releaseLogin = resolve;
				});
				return Response.json({
					username: 'synthetic-student',
					domain: 'district.test',
					sessionId: 'late'
				});
			}
			return Response.json({ code: 'APP_SESSION_INVALID' }, { status: 401 });
		})
	);
	const result = account.gradebookRequest();
	const rejection = expect(result).rejects.toMatchObject({ code: 'APP_SESSION_INVALID' });
	await login;
	acc.studentAccount = undefined;
	storage.clear();
	resetPortalConnection();
	expect(authSignal?.aborted).toBe(true);
	releaseLogin();
	await rejection;
	expect(account.sessionId).toBe('old');
	expect(storage.has('token')).toBe(false);
	expect(assign).not.toHaveBeenCalled();
	expect(refreshGradebookAfterSessionRestore).not.toHaveBeenCalled();
	expect(portalConnection.state).toBe('idle');
});

test('queued old-session reads and the recovery retry acquire the renewed session lock', async () => {
	const { account } = activeSyntheticAccount();
	vi.mocked(loadStoredCredentials).mockResolvedValue({
		domain: 'district.test',
		username: 'synthetic-student',
		password: 'synthetic-password'
	});
	const tails = new Map<string, Promise<void>>();
	const held = new Set<string>();
	const lockRequest = vi.fn((name: string, operation: () => Promise<unknown>) => {
		const result = (tails.get(name) ?? Promise.resolve()).then(async () => {
			held.add(name);
			try {
				return await operation();
			} finally {
				held.delete(name);
			}
		});
		tails.set(
			name,
			result.then(
				() => undefined,
				() => undefined
			)
		);
		return result;
	});
	vi.stubGlobal('navigator', { locks: { request: lockRequest } });
	let renewedReads = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
			if (path === '/api/session')
				return Response.json({
					username: 'synthetic-student',
					domain: 'district.test',
					sessionId: 'new'
				});
			const session = new Headers(init?.headers).get('X-Grademaxxing-Session');
			if (session === 'old')
				return Response.json({ code: 'UPSTREAM_SESSION_EXPIRED' }, { status: 401 });
			expect(session).toBe('new');
			expect(held.has('grademaxxing-studentvue-new')).toBe(true);
			renewedReads += 1;
			await Promise.resolve();
			return Response.json({ xml: '<Gradebook />', detailed: true });
		})
	);
	vi.mocked(refreshGradebookAfterSessionRestore).mockImplementationOnce(async () => {
		await account.gradebookRequest(undefined, false, true);
		return true;
	});
	await Promise.all([account.gradebookRequest(), account.attendance()]);
	expect(renewedReads).toBe(3);
	expect(
		lockRequest.mock.calls.filter(([name]) => name === 'grademaxxing-studentvue-new')
	).toHaveLength(3);
	expect(sessionRecovery.active).toBe(false);
});

test.each([401, 502])(
	'vault credentials are cleared only after a confirmed authentication rejection (%s)',
	async (status) => {
		const { account } = activeSyntheticAccount();
		vi.mocked(loadStoredCredentials).mockResolvedValue({
			domain: 'district.test',
			username: 'synthetic-student',
			password: 'synthetic-password'
		});
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ code: 'UPSTREAM_SESSION_EXPIRED' }, { status: 401 }))
			.mockResolvedValueOnce(
				Response.json({ message: 'StudentVUE authentication failed.' }, { status })
			);
		vi.stubGlobal('fetch', fetchMock);
		await expect(account.gradebookRequest()).rejects.toBeInstanceOf(StudentVueSessionExpiredError);
		expect(clearStoredCredentials).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(sessionRecovery.active).toBe(false);
	}
);

test.each(['token', 'account', 'recovery'])(
	'bad-password cleanup stops owning the vault when its %s is replaced while queued',
	async (replacement) => {
		const { account, storage } = activeSyntheticAccount();
		vi.mocked(loadStoredCredentials).mockResolvedValue({
			domain: 'district.test',
			username: 'synthetic-student',
			password: 'synthetic-password'
		});
		vi.stubGlobal(
			'fetch',
			vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(Response.json({ code: 'UPSTREAM_SESSION_EXPIRED' }, { status: 401 }))
				.mockResolvedValueOnce(
					Response.json({ message: 'StudentVUE authentication failed.' }, { status: 401 })
				)
		);
		let cleanupCurrent: (() => boolean) | undefined;
		let cleanupStarted!: () => void;
		const started = new Promise<void>((resolve) => (cleanupStarted = resolve));
		let releaseCleanup!: () => void;
		const queued = new Promise<void>((resolve) => (releaseCleanup = resolve));
		vi.mocked(clearStoredCredentials).mockImplementationOnce(async (isCurrent) => {
			cleanupCurrent = isCurrent;
			cleanupStarted();
			await queued;
		});
		const result = account.gradebookRequest();
		const rejection = expect(result).rejects.toBeInstanceOf(StudentVueSessionExpiredError);
		await started;
		try {
			expect(cleanupCurrent).toBeTypeOf('function');
			expect(cleanupCurrent?.()).toBe(true);
			if (replacement === 'token') storage.set('token', JSON.stringify({ sessionId: 'new' }));
			else if (replacement === 'account')
				acc.studentAccount = new StudentAccount('district.test', 'other-student', '', 'new');
			else beginSessionRecovery();
			expect(cleanupCurrent?.()).toBe(false);
		} finally {
			releaseCleanup();
		}
		await rejection;
	}
);

test('an ambiguous upstream 401 is treated as a temporary portal failure, not a sign-out', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn<typeof fetch>()
			.mockResolvedValue(Response.json({ message: 'Temporary gateway response' }, { status: 401 }))
	);

	await expect(apiRequest('/api/studentvue/gradebook')).rejects.toThrow(
		'Temporary gateway response'
	);
});

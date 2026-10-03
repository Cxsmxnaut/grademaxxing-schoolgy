import type { StudentAccount } from '$lib/synergy';
import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest';

interface RecordState<T> {
	data?: T;
	loaded: boolean;
	refreshing?: boolean;
	error?: string;
	lastRefresh?: number;
}

let loadRecord: typeof import('$lib/storage/record-state').loadRecord;
let invalidateRecordState: typeof import('$lib/storage/record-state').invalidateRecordState;
let acc: typeof import('$lib/account.svelte').acc;

class MemoryStorage {
	#values = new Map<string, string>();

	getItem(key: string) {
		return this.#values.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.#values.set(key, value);
	}

	removeItem(key: string) {
		this.#values.delete(key);
	}
}

beforeAll(async () => {
	Object.defineProperty(globalThis, '$state', {
		configurable: true,
		value: <T>(value: T) => value
	});
	({ loadRecord, invalidateRecordState } = await import('$lib/storage/record-state'));
	({ acc } = await import('$lib/account.svelte'));
});

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: new MemoryStorage()
	});
	localStorage.setItem('gradebookOwner', 'student-a');
	acc.studentAccount = {} as StudentAccount;
});

afterEach(() => {
	acc.studentAccount = undefined;
});

test('failed background refresh preserves cached data and exposes a retryable error', async () => {
	const cached = { value: 'cached' };
	localStorage.setItem(
		'record',
		JSON.stringify({ data: cached, lastRefresh: 1, owner: 'student-a' })
	);
	const state: RecordState<typeof cached> = { loaded: false };

	await loadRecord(
		state,
		async () => {
			throw new Error('StudentVUE is temporarily unavailable.');
		},
		'record',
		0
	);

	expect(state.data).toEqual(cached);
	expect(state.error).toBe('StudentVUE is temporarily unavailable.');
	expect(state.loaded).toBe(true);
	expect(state.refreshing).toBe(false);
});

test('successful retry clears the previous error and replaces the cache', async () => {
	const state: RecordState<{ value: string }> = {
		data: { value: 'cached' },
		loaded: true,
		error: 'Earlier failure'
	};

	await loadRecord(state, async () => ({ value: 'live' }), 'record', 60_000, true);

	expect(state.data).toEqual({ value: 'live' });
	expect(state.error).toBeUndefined();
	expect(typeof state.lastRefresh).toBe('number');
	expect(JSON.parse(localStorage.getItem('record') ?? '')).toMatchObject({
		data: { value: 'live' },
		owner: 'student-a'
	});
});

test('a cache from another student is never rendered', async () => {
	localStorage.setItem(
		'record',
		JSON.stringify({
			data: { value: 'other-student' },
			lastRefresh: Date.now(),
			owner: 'student-b'
		})
	);
	const state: RecordState<{ value: string }> = { loaded: false };
	await loadRecord(state, async () => ({ value: 'current-student' }), 'record', 60_000);
	expect(state.data).toEqual({ value: 'current-student' });
	expect(JSON.parse(localStorage.getItem('record') ?? '')).toMatchObject({
		data: { value: 'current-student' },
		owner: 'student-a'
	});
});

test('a second refresh cannot start while the first one is pending', async () => {
	let finish!: (value: { value: string }) => void;
	let calls = 0;
	const pending = new Promise<{ value: string }>((resolve) => (finish = resolve));
	const state: RecordState<{ value: string }> = { loaded: false };
	const loader = () => {
		calls += 1;
		return pending;
	};

	const first = loadRecord(state, loader, 'record', 0, true);
	await loadRecord(state, loader, 'record', 0, true);
	expect(calls).toBe(1);
	expect(state.refreshing).toBe(true);

	finish({ value: 'done' });
	await first;
	expect(state.data).toEqual({ value: 'done' });
	expect(state.refreshing).toBe(false);
});

test('a response finishing after account reset cannot repopulate shared student state', async () => {
	let finish!: (value: { value: string }) => void;
	const pending = new Promise<{ value: string }>((resolve) => (finish = resolve));
	const state: RecordState<{ value: string }> = { loaded: false };

	const request = loadRecord(state, () => pending, 'record', 0, true);
	expect(state.refreshing).toBe(true);
	invalidateRecordState(state);
	state.data = undefined;
	state.loaded = false;
	state.refreshing = false;

	finish({ value: 'stale-student-data' });
	await request;
	expect(state).toEqual({ data: undefined, loaded: false, refreshing: false });
	expect(localStorage.getItem('record')).toBeNull();
});

test('a retired account rejection cannot overwrite records loaded for the replacement account', async () => {
	let rejectOld!: (error: Error) => void;
	const pendingOld = new Promise<{ value: string }>((_, reject) => (rejectOld = reject));
	const state: RecordState<{ value: string }> = { loaded: false };
	const oldRequest = loadRecord(state, () => pendingOld, 'record', 0, true);
	expect(state.refreshing).toBe(true);

	invalidateRecordState(state);
	state.data = undefined;
	state.loaded = false;
	state.refreshing = false;
	state.error = undefined;
	acc.studentAccount = {} as StudentAccount;
	localStorage.setItem('gradebookOwner', 'student-b');
	await loadRecord(state, async () => ({ value: 'replacement-account' }), 'record', 0, true);
	const currentState = { ...state };
	const currentCache = localStorage.getItem('record');
	expect(currentState).toMatchObject({
		data: { value: 'replacement-account' },
		loaded: true,
		refreshing: false,
		error: undefined
	});

	rejectOld(new Error('Retired StudentVUE request failed.'));
	await oldRequest;
	expect(state).toEqual(currentState);
	expect(localStorage.getItem('record')).toBe(currentCache);
});

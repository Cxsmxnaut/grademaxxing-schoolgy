import {
	clearStoredCredentials,
	saveStoredCredentials,
	subscribeStoredCredentialsChanges
} from '$lib/auth/credential-vault';
import { afterEach, expect, test, vi } from 'vitest';

const credentials = {
	domain: 'district.test',
	username: 'synthetic-student',
	password: 'synthetic-password'
};

function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => (release = resolve));
	return { promise, release };
}

function request<T>(result: T) {
	const value = { result, onsuccess: null as null | (() => void) };
	queueMicrotask(() => value.onsuccess?.());
	return value;
}

function mockVault(openGate?: ReturnType<typeof gate>) {
	const values = new Map<string, string>();
	const events = new EventTarget();
	const encryptionStarted = gate();
	const encryptionGate = gate();
	const databaseOpened = gate();
	const key = {} as CryptoKey;
	const deleteKey = vi.fn(() => request(undefined));
	const encrypt = vi.fn(async () => {
		encryptionStarted.release();
		await encryptionGate.promise;
		return new Uint8Array([1, 2, 3]).buffer;
	});
	const database = {
		transaction: () => ({ objectStore: () => ({ get: () => request(key), delete: deleteKey }) }),
		close: vi.fn()
	};
	vi.stubGlobal('window', {
		addEventListener: events.addEventListener.bind(events),
		removeEventListener: events.removeEventListener.bind(events),
		dispatchEvent: events.dispatchEvent.bind(events),
		indexedDB: {
			open: () => {
				const opened = { result: database, onsuccess: null as null | (() => void) };
				databaseOpened.release();
				void (openGate?.promise ?? Promise.resolve()).then(() => opened.onsuccess?.());
				return opened;
			}
		},
		crypto: {
			subtle: { encrypt },
			getRandomValues: (bytes: Uint8Array) => bytes.fill(1)
		},
		btoa
	});
	vi.stubGlobal('navigator', {});
	vi.stubGlobal('localStorage', {
		getItem: (name: string) => values.get(name) ?? null,
		setItem: (name: string, value: string) => values.set(name, value),
		removeItem: (name: string) => values.delete(name)
	});
	return { values, deleteKey, encrypt, encryptionStarted, encryptionGate, databaseOpened };
}

afterEach(() => vi.unstubAllGlobals());

test('a cancelled credential save cannot overwrite credentials installed during encryption', async () => {
	const vault = mockVault();
	let current = true;
	const save = saveStoredCredentials(credentials, () => current);
	await vault.encryptionStarted.promise;
	current = false;
	vault.values.set('studentvueCredentials', 'replacement-envelope');
	vault.encryptionGate.release();
	await expect(save).resolves.toBe(false);
	expect(vault.values.get('studentvueCredentials')).toBe('replacement-envelope');
});

test('a cancelled credential clear cannot delete the replacement key after waiting for IndexedDB', async () => {
	const openGate = gate();
	const vault = mockVault(openGate);
	let current = true;
	const clear = clearStoredCredentials(() => current);
	await vault.databaseOpened.promise;
	current = false;
	vault.values.set('studentvueCredentials', 'replacement-envelope');
	openGate.release();
	await clear;
	expect(vault.deleteKey).not.toHaveBeenCalled();
	expect(vault.values.get('studentvueCredentials')).toBe('replacement-envelope');
});

test('a queued stale clear cannot erase a successful credential save', async () => {
	const vault = mockVault();
	const save = saveStoredCredentials(credentials);
	await vault.encryptionStarted.promise;
	let current = true;
	const clear = clearStoredCredentials(() => current);
	current = false;
	vault.encryptionGate.release();
	await expect(save).resolves.toBe(true);
	await clear;
	expect(vault.values.has('studentvueCredentials')).toBe(true);
	expect(vault.deleteKey).not.toHaveBeenCalled();
});

test('credential mutations use one shared browser lock for cross-tab serialization', async () => {
	const vault = mockVault();
	const lock = vi.fn(async (_name: string, operation: () => Promise<unknown>) => operation());
	vi.stubGlobal('navigator', { locks: { request: lock } });
	vault.encryptionGate.release();
	await saveStoredCredentials(credentials);
	await clearStoredCredentials();
	expect(lock.mock.calls.map(([name]) => name)).toEqual([
		'grademaxxing-credential-vault',
		'grademaxxing-credential-vault'
	]);
});

test('credential retention subscribers update after mutations and storage changes', async () => {
	const vault = mockVault();
	const changed = vi.fn();
	const unsubscribe = subscribeStoredCredentialsChanges(changed);
	vault.encryptionGate.release();
	await saveStoredCredentials(credentials);
	expect(changed).toHaveBeenCalledTimes(1);
	await clearStoredCredentials();
	expect(changed).toHaveBeenCalledTimes(2);

	window.dispatchEvent(
		Object.assign(new Event('storage'), { key: 'studentvueCredentials', storageArea: localStorage })
	);
	expect(changed).toHaveBeenCalledTimes(3);
	window.dispatchEvent(
		Object.assign(new Event('storage'), { key: 'unrelated', storageArea: localStorage })
	);
	expect(changed).toHaveBeenCalledTimes(3);

	unsubscribe();
	await clearStoredCredentials();
	expect(changed).toHaveBeenCalledTimes(3);
});

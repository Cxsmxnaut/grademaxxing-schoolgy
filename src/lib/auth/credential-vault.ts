const DATABASE_NAME = 'grademaxxing-vault';
const DATABASE_VERSION = 1;
const KEY_STORE_NAME = 'keys';
const KEY_NAME = 'studentvue-credentials-v1';
const STORAGE_KEY = 'studentvueCredentials';
const MUTATION_LOCK_NAME = 'grademaxxing-credential-vault';
const CHANGE_EVENT_NAME = 'grademaxxing-credential-vault-change';
let mutationTail = Promise.resolve();

export function subscribeStoredCredentialsChanges(listener: () => void) {
	if (typeof window === 'undefined') return () => {};
	const handleStorage = (event: StorageEvent) => {
		if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null))
			listener();
	};
	window.addEventListener(CHANGE_EVENT_NAME, listener);
	window.addEventListener('storage', handleStorage);
	return () => {
		window.removeEventListener(CHANGE_EVENT_NAME, listener);
		window.removeEventListener('storage', handleStorage);
	};
}

function notifyStoredCredentialsChanges() {
	window.dispatchEvent(new Event(CHANGE_EVENT_NAME));
}

async function serializeVaultMutation<T>(operation: () => Promise<T>): Promise<T> {
	if (typeof navigator !== 'undefined' && navigator.locks)
		return navigator.locks.request(MUTATION_LOCK_NAME, operation);
	const result = mutationTail.then(operation, operation);
	mutationTail = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}

export type StoredStudentVueCredentials = {
	domain: string;
	username: string;
	password: string;
};

type CredentialEnvelope = {
	v: 1;
	iv: string;
	ciphertext: string;
};

function isVaultAvailable() {
	return (
		typeof window !== 'undefined' &&
		typeof window.indexedDB !== 'undefined' &&
		typeof window.crypto?.subtle !== 'undefined'
	);
}

function openDatabase() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(KEY_STORE_NAME))
				request.result.createObjectStore(KEY_STORE_NAME);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error('Could not open credential storage.'));
	});
}

function readKey(database: IDBDatabase) {
	return new Promise<CryptoKey | undefined>((resolve, reject) => {
		const request = database
			.transaction(KEY_STORE_NAME, 'readonly')
			.objectStore(KEY_STORE_NAME)
			.get(KEY_NAME);
		request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
		request.onerror = () =>
			reject(request.error ?? new Error('Could not read credential storage.'));
	});
}

function writeKey(database: IDBDatabase, key: CryptoKey) {
	return new Promise<void>((resolve, reject) => {
		const request = database
			.transaction(KEY_STORE_NAME, 'readwrite')
			.objectStore(KEY_STORE_NAME)
			.put(key, KEY_NAME);
		request.onsuccess = () => resolve();
		request.onerror = () =>
			reject(request.error ?? new Error('Could not save credential storage.'));
	});
}

function deleteKey(database: IDBDatabase) {
	return new Promise<void>((resolve, reject) => {
		const request = database
			.transaction(KEY_STORE_NAME, 'readwrite')
			.objectStore(KEY_STORE_NAME)
			.delete(KEY_NAME);
		request.onsuccess = () => resolve();
		request.onerror = () =>
			reject(request.error ?? new Error('Could not clear credential storage.'));
	});
}

async function getKey(create: boolean, isCurrent = () => true) {
	const database = await openDatabase();
	try {
		if (!isCurrent()) return undefined;
		const existing = await readKey(database);
		if (!isCurrent()) return undefined;
		if (existing || !create) return existing;
		const generated = (await window.crypto.subtle.generateKey(
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		)) as CryptoKey;
		if (!isCurrent()) return undefined;
		await writeKey(database, generated);
		return generated;
	} finally {
		database.close();
	}
}

function toBase64(bytes: Uint8Array) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return window.btoa(binary);
}

function fromBase64(value: string) {
	const binary = window.atob(value);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validCredentials(value: unknown): value is StoredStudentVueCredentials {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<StoredStudentVueCredentials>;
	return (
		typeof candidate.domain === 'string' &&
		candidate.domain.length > 0 &&
		candidate.domain.length <= 253 &&
		typeof candidate.username === 'string' &&
		candidate.username.length > 0 &&
		candidate.username.length <= 254 &&
		typeof candidate.password === 'string' &&
		candidate.password.length > 0 &&
		candidate.password.length <= 1024
	);
}

export async function saveStoredCredentials(
	credentials: StoredStudentVueCredentials,
	isCurrent = () => true
) {
	if (!isVaultAvailable() || !validCredentials(credentials)) return false;
	try {
		return await serializeVaultMutation(async () => {
			if (!isCurrent()) return false;
			const key = await getKey(true, isCurrent);
			if (!key || !isCurrent()) return false;
			const iv = window.crypto.getRandomValues(new Uint8Array(12));
			const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
			const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
			if (!isCurrent()) return false;
			const envelope: CredentialEnvelope = {
				v: 1,
				iv: toBase64(iv),
				ciphertext: toBase64(new Uint8Array(encrypted))
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
			notifyStoredCredentialsChanges();
			return true;
		});
	} catch {
		return false;
	}
}

export async function loadStoredCredentials(): Promise<StoredStudentVueCredentials | undefined> {
	if (!isVaultAvailable()) return undefined;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return undefined;
		const envelope = JSON.parse(raw) as Partial<CredentialEnvelope>;
		if (
			envelope.v !== 1 ||
			typeof envelope.iv !== 'string' ||
			typeof envelope.ciphertext !== 'string'
		)
			return undefined;
		const key = await getKey(false);
		if (!key) return undefined;
		const plaintext = await window.crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromBase64(envelope.iv) },
			key,
			fromBase64(envelope.ciphertext)
		);
		const credentials = JSON.parse(new TextDecoder().decode(plaintext));
		return validCredentials(credentials) ? credentials : undefined;
	} catch {
		return undefined;
	}
}

export async function clearStoredCredentials(isCurrent = () => true) {
	try {
		await serializeVaultMutation(async () => {
			if (!isCurrent()) return;
			try {
				localStorage.removeItem(STORAGE_KEY);
				notifyStoredCredentialsChanges();
			} catch {
				// Storage may be unavailable; there is nothing else to clear in that case.
			}
			if (!isVaultAvailable()) return;
			const database = await openDatabase();
			try {
				if (isCurrent()) await deleteKey(database);
			} finally {
				database.close();
			}
		});
	} catch {
		// Best-effort cleanup; Clear-Site-Data still handles supported browsers on logout.
	}
}

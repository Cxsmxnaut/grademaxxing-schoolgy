import { pruneChatArchive, type ChatArchive } from './conversations';
const PREFIX = 'maxChats.v1.';
const DATABASE = 'grademaxxing-max-chats';
let mutationTail = Promise.resolve();
const storageError = () =>
	new Error('Chats could not be saved on this device. You can continue chatting.');

export async function maxChatOwner(domain: string, userID: string) {
	const identity = JSON.stringify([
		domain
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, '')
			.replace(/\/$/, ''),
		userID.trim().toLowerCase()
	]);
	const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function openDatabase() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = window.indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore('keys');
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(storageError());
		request.onblocked = () => reject(storageError());
	});
}
async function keyFor(owner: string, create: boolean) {
	const database = await openDatabase();
	try {
		const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
			const request = database.transaction('keys').objectStore('keys').get(owner);
			request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
			request.onerror = () => reject(storageError());
		});
		if (existing || !create) return existing;
		const key = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
			'encrypt',
			'decrypt'
		]);
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction('keys', 'readwrite');
			transaction.objectStore('keys').put(key, owner);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(storageError());
			transaction.onabort = () => reject(storageError());
		});
		return key;
	} finally {
		database.close();
	}
}
async function serialize<T>(owner: string, operation: () => Promise<T>): Promise<T> {
	if (typeof navigator !== 'undefined' && navigator.locks)
		return await navigator.locks.request(`grademaxxing-max-chats-${owner}`, operation);
	const result = mutationTail.then(operation, operation);
	mutationTail = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}
const base64 = (bytes: Uint8Array) => {
	let text = '';
	for (const byte of bytes) text += String.fromCharCode(byte);
	return window.btoa(text);
};
const unbase64 = (text: string) =>
	Uint8Array.from(window.atob(text), (character) => character.charCodeAt(0));
async function read(owner: string): Promise<ChatArchive> {
	const raw = localStorage.getItem(PREFIX + owner);
	if (!raw) return { activeId: null, conversations: [] };
	if (raw.length > 2 * 1024 * 1024) throw storageError();
	const envelope = JSON.parse(raw) as { iv: string; ciphertext: string };
	const key = await keyFor(owner, false);
	if (!key || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string')
		throw storageError();
	const plaintext = await window.crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: unbase64(envelope.iv), additionalData: new TextEncoder().encode(owner) },
		key,
		unbase64(envelope.ciphertext)
	);
	return pruneChatArchive(JSON.parse(new TextDecoder().decode(plaintext)));
}
export const loadMaxChatArchive = async (owner: string, isCurrent = () => true) =>
	(await updateMaxChatArchive(owner, (archive) => archive, isCurrent)) ?? {
		activeId: null,
		conversations: []
	};
export function updateMaxChatArchive(
	owner: string,
	update: (archive: ChatArchive) => ChatArchive,
	isCurrent = () => true
) {
	return serialize(owner, async () => {
		if (!isCurrent()) return null;
		const archive = pruneChatArchive(update(await read(owner)));
		const key = await keyFor(owner, true);
		if (!key || !isCurrent()) return null;
		const iv = window.crypto.getRandomValues(new Uint8Array(12));
		const ciphertext = await window.crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner) },
			key,
			new TextEncoder().encode(JSON.stringify(archive))
		);
		if (!isCurrent()) return null;
		localStorage.setItem(
			PREFIX + owner,
			JSON.stringify({ iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) })
		);
		return archive;
	});
}
export function clearMaxChatArchive(owner: string) {
	return serialize(owner, async () => {
		localStorage.removeItem(PREFIX + owner);
		const database = await openDatabase();
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction('keys', 'readwrite');
				transaction.objectStore('keys').delete(owner);
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(storageError());
			});
		} finally {
			database.close();
		}
	});
}

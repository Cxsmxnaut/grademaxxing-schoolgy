import { acc } from '$lib/account.svelte';
import { LocalStorageKey } from './keys';

export interface RecordState<T> {
	data?: T;
	loaded: boolean;
	refreshing?: boolean;
	error?: string;
	lastRefresh?: number;
}

interface LocalStorageCache<T> {
	data: T;
	lastRefresh: number;
	owner: string;
}

const maximumCacheSize = 10 * 1024 * 1024;
const recordGenerations = new WeakMap<object, number>();

export function invalidateRecordState(recordState: RecordState<unknown>) {
	recordGenerations.set(recordState, (recordGenerations.get(recordState) ?? 0) + 1);
}

export async function loadRecord<T>(
	recordState: RecordState<T>,
	load: () => Promise<T>,
	localStorageKey: string,
	cacheExpirationTime: number | undefined,
	forceRefresh = false
) {
	if (
		(recordState.data !== undefined && !forceRefresh) ||
		acc.studentAccount === undefined ||
		recordState.refreshing
	) {
		return;
	}

	const account = acc.studentAccount;
	const generation = (recordGenerations.get(recordState) ?? 0) + 1;
	recordGenerations.set(recordState, generation);
	const isCurrent = () =>
		recordGenerations.get(recordState) === generation && acc.studentAccount === account;

	recordState.refreshing = true;
	recordState.error = undefined;

	try {
		let shouldRefresh = true;
		let owner: string | null = null;
		let serializedCache: string | null = null;

		try {
			owner = localStorage.getItem(LocalStorageKey.gradebookOwner);
			serializedCache = localStorage.getItem(localStorageKey);
		} catch {
			// Private browsing policies may disable storage while live API access still works.
		}

		if (serializedCache !== null) {
			try {
				if (serializedCache.length > maximumCacheSize) throw new Error('Saved data is too large.');

				const cache = JSON.parse(serializedCache) as Partial<LocalStorageCache<T>>;
				if (
					!owner ||
					cache.owner !== owner ||
					!Number.isFinite(cache.lastRefresh) ||
					cache.lastRefresh! < 0 ||
					!Object.hasOwn(cache, 'data')
				) {
					throw new Error('Saved data belongs to a different or invalid session.');
				}

				if (!isCurrent()) return;
				recordState.data = cache.data as T;
				recordState.lastRefresh = cache.lastRefresh!;

				if (
					cacheExpirationTime !== undefined &&
					Date.now() - cache.lastRefresh! < cacheExpirationTime
				) {
					shouldRefresh = false;
				}
			} catch {
				try {
					localStorage.removeItem(localStorageKey);
				} catch {
					// Storage is an optional acceleration layer, never a prerequisite for live data.
				}
			}
		}

		if (shouldRefresh || forceRefresh) {
			try {
				const data = await load();
				if (!isCurrent()) return;

				recordState.data = data;
				recordState.lastRefresh = Date.now();

				if (owner) {
					const cache: LocalStorageCache<T> = {
						data,
						lastRefresh: recordState.lastRefresh,
						owner
					};

					try {
						localStorage.setItem(localStorageKey, JSON.stringify(cache));
					} catch {
						// A full/disabled cache must not turn a successful StudentVUE response into an error.
					}
				}
			} catch (error) {
				if (!isCurrent()) return;
				recordState.error =
					error instanceof Error ? error.message : 'The request failed unexpectedly.';
			}
		}
	} catch (error) {
		if (!isCurrent()) return;
		recordState.error = error instanceof Error ? error.message : 'The request failed unexpectedly.';
	} finally {
		if (isCurrent()) {
			recordState.loaded = true;
			recordState.refreshing = false;
		}
	}
}

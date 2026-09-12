import { LocalStorageKey } from '$lib/storage/keys';

export function getSeenAssignmentsFromLocalStorage() {
	const seenIDsStr = localStorage.getItem(LocalStorageKey.seenAssignmentIDs);
	const owner = localStorage.getItem(LocalStorageKey.gradebookOwner);
	if (seenIDsStr === null || owner === null) return;

	const cache = JSON.parse(seenIDsStr) as { owner?: unknown; ids?: unknown };
	if (cache.owner !== owner || !Array.isArray(cache.ids) || cache.ids.length > 50_000)
		throw new Error('Saved assignment activity belongs to a different or invalid session.');

	const seenAssignmentIDs = new Set<string>();
	cache.ids.forEach((id) => {
		if (typeof id === 'string' && id.length <= 512) seenAssignmentIDs.add(id);
	});

	return seenAssignmentIDs;
}

export const saveSeenAssignmentsToLocalStorage = (seenAssignmentIDs: Set<string>) => {
	try {
		const owner = localStorage.getItem(LocalStorageKey.gradebookOwner);
		if (!owner) return;
		localStorage.setItem(
			LocalStorageKey.seenAssignmentIDs,
			JSON.stringify({ owner, ids: [...seenAssignmentIDs].slice(-50_000) })
		);
	} catch {
		// Assignment state remains correct in-memory when storage is unavailable.
	}
};

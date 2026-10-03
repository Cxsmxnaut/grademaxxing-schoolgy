import { getGradebookCacheOwnerFor, gradebookCacheBelongsTo } from '$lib/grades/refresh';
import { seenAssignmentIDs } from '$lib/grades/seenAssignments.svelte';
import { LocalStorageKey } from '$lib/storage/keys';

/** Prepare device caches before installing either a manual or vault-restored login. */
export async function prepareStudentAccountCaches(
	account: { domain: string; userID: string },
	isCurrent = () => true
) {
	const identity = getGradebookCacheOwnerFor(account)!;
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
	if (!isCurrent()) return false;
	const ownerFingerprint = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
	let sameStudent = localStorage.getItem(LocalStorageKey.gradebookOwner) === ownerFingerprint;
	if (!sameStudent) {
		try {
			const saved = JSON.parse(localStorage.getItem(LocalStorageKey.gradebook) ?? 'null');
			sameStudent = gradebookCacheBelongsTo(saved?.owner, account);
		} catch {
			// An unreadable cache never authorizes reuse.
		}
	}
	const previousToken = localStorage.getItem(LocalStorageKey.token);
	if (!sameStudent && previousToken !== null) {
		try {
			const previous = JSON.parse(previousToken) as { username?: unknown; domain?: unknown };
			sameStudent =
				typeof previous.username === 'string' &&
				typeof previous.domain === 'string' &&
				getGradebookCacheOwnerFor({ domain: previous.domain, userID: previous.username }) ===
					getGradebookCacheOwnerFor(account);
		} catch {
			// Invalid identity metadata never authorizes cache reuse.
		}
	}
	if (!sameStudent) {
		seenAssignmentIDs.clear();
		for (const key of Object.values(LocalStorageKey)) {
			if (key !== LocalStorageKey.token && key !== LocalStorageKey.gradebookOwner)
				localStorage.removeItem(key);
		}
	}
	localStorage.setItem(LocalStorageKey.gradebookOwner, ownerFingerprint);
	return true;
}

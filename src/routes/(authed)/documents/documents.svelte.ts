import { acc } from '$lib/account.svelte';
import type { Documents } from '$lib/contracts/studentvue/documents';
import { LocalStorageKey } from '$lib/storage/keys';
import { invalidateRecordState, loadRecord, type RecordState } from '$lib/storage/record-state';

export const documentsState: RecordState<Documents> = $state({ loaded: false });

export const resetDocuments = () => {
	invalidateRecordState(documentsState);
	documentsState.data = undefined;
	documentsState.loaded = false;
	documentsState.refreshing = false;
	documentsState.error = undefined;
	documentsState.lastRefresh = undefined;
};

export const loadDocuments = async (forceRefresh = false) => {
	const { studentAccount } = acc;
	if (!studentAccount) return;

	await loadRecord(
		documentsState,
		() => studentAccount.documents(),
		LocalStorageKey.documents,
		1000 * 60 * 60 * 24,
		forceRefresh
	);
};

import { acc } from '$lib/account.svelte';
import type { MailData } from '$lib/contracts/studentvue/mail';
import { LocalStorageKey } from '$lib/storage/keys';
import { invalidateRecordState, loadRecord, type RecordState } from '$lib/storage/record-state';

export const mailDataState: RecordState<MailData> = $state({ loaded: false });

export const resetMailData = () => {
	invalidateRecordState(mailDataState);
	mailDataState.data = undefined;
	mailDataState.loaded = false;
	mailDataState.refreshing = false;
	mailDataState.error = undefined;
	mailDataState.lastRefresh = undefined;
};

export const loadMailData = async (forceRefresh = false) => {
	const { studentAccount } = acc;
	if (!studentAccount) return;

	await loadRecord(
		mailDataState,
		() => studentAccount.mailData(),
		LocalStorageKey.mailData,
		1000 * 60 * 60,
		forceRefresh
	);
};

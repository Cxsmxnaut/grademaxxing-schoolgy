import { acc } from '$lib/account.svelte';
import type { StudentInfo } from '$lib/contracts/studentvue/student-info';
import { LocalStorageKey } from '$lib/storage/keys';
import { invalidateRecordState, loadRecord, type RecordState } from '$lib/storage/record-state';

export const studentInfoState: RecordState<StudentInfo> = $state({ loaded: false });

export const resetStudentInfo = () => {
	invalidateRecordState(studentInfoState);
	studentInfoState.data = undefined;
	studentInfoState.loaded = false;
	studentInfoState.refreshing = false;
	studentInfoState.error = undefined;
	studentInfoState.lastRefresh = undefined;
};

export const loadStudentInfo = async (forceRefresh = false) => {
	const { studentAccount } = acc;
	if (!studentAccount) return;

	await loadRecord(
		studentInfoState,
		() => studentAccount.studentInfo(),
		LocalStorageKey.studentInfo,
		1000 * 60 * 60 * 24 * 30,
		forceRefresh
	);
};
